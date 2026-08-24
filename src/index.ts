/**
 * dsh-commandcode-usage-monitor — DeepSeek Harness plugin.
 *
 * Monitors Command Code account usage/credit windows by calling the same
 * `/alpha/*` account endpoints the official CLI `/usage` command uses, and
 * exposes:
 *  - in-memory snapshot + events
 *  - webServer JSON routes (`/commandcode-usage/*`)
 *  - optional `/commandcode-usage` slash command
 *  - optional session-event per-turn cost aggregation
 *  - browser widget and settings page via `src/client/`
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { Config, resolveConfig } from './config.ts'
import type { Config as ConfigType } from './config.ts'
import { CommandCodeClient } from './client.ts'
import { UsageStore } from './store.ts'
import { UsagePoller } from './poller.ts'
import { registerUsageRoutes } from './routes.ts'
import { applySessionWatcher } from './session-watcher.ts'
import { applyCommands } from './commands.ts'
import { resolveApiKey } from './credentials.ts'
import { registerUiRoutes } from './ui-routes.ts'

/** Settings namespace registered in the Host for the browser UI page. */
export const UI_SETTINGS_NAMESPACE = settingsNamespace('commandcode-usage-ui')

/** Schema for the UI preference namespace. */
export const UiConfig: z<ConfigType['ui']> = z.object({
  showWidget: z.boolean().default(true),
  notifyTurnCost: z.boolean().default(true),
  pollIntervalMs: z.number().min(1000).max(86_400_000).default(60_000),
  turnCostCloseMs: z.number().min(0).max(600_000).default(8_000),
})

export { Config }
export { CommandCodeClient } from './client.ts'
export { UsageStore } from './store.ts'
export { UsagePoller } from './poller.ts'
export * from './types.ts'

export const name = 'commandcode-usage-monitor'
export const inject = ['webServer']

/** Resolve a single account's API key from config/credentials/environment. */
function makeResolveApiKey(ctx: Context, config: () => ReturnType<typeof resolveConfig>) {
  return async (accountId: string): Promise<string | undefined> => {
    const cfg = config()
    // The default account resolves the top-level key.
    if (accountId === 'default') {
      return resolveApiKey({
        ctx,
        apiKeyEnv: cfg.apiKeyEnv,
        literalApiKey: cfg.apiKey || undefined,
      })
    }
    // Extra accounts: find by id (credential ref or positional id).
    const accounts = cfg.accounts
    const index = accounts.findIndex((a) => (a.apiKeyEnv ?? '') === accountId || `account-${accounts.indexOf(a) + 2}` === accountId)
    if (index < 0) return undefined
    const account = accounts[index]!
    return resolveApiKey({
      ctx,
      apiKeyEnv: cfg.apiKeyEnv,
      literalApiKey: cfg.apiKey || undefined,
      accountApiKey: account.apiKey || undefined,
      accountApiKeyEnv: account.apiKeyEnv || undefined,
    })
  }
}

export function apply(ctx: Context, rawConfig: ConfigType): void {
  let current: () => ReturnType<typeof resolveConfig> = () => resolveConfig(rawConfig)
  const cfg = () => current()

  // ── CMDAI UI credential routes ───────────────────────────────────────────
  // The browser config page manipulates the configured API key through this
  // same-origin surface. When the credentials service is mounted, writes go to
  // the service's own store; otherwise an ambient env name cannot be written
  // and the UI reports read-only.
  const credentialApiKeyEnv = () => cfg().apiKeyEnv
  const describeCredential = async () => {
    const credentials = ctx.get('credentials')
    const ref = credentialRef(credentialApiKeyEnv())
    if (credentials) {
      const info = await credentials.describe(ref)
      return { configured: info.configured, writable: info.writable }
    }
    // Fall back to ambient resolution only for presence reporting.
    const key = await resolveApiKey({ ctx, apiKeyEnv: credentialApiKeyEnv(), literalApiKey: cfg().apiKey || undefined })
    return { configured: key !== undefined, writable: false }
  }
  const setCredential = async (key: string) => {
    const credentials = ctx.get('credentials')
    if (!credentials) throw new Error('credentials service unavailable: cannot persist an API key')
    await credentials.set(credentialRef(credentialApiKeyEnv()), key)
    const info = await credentials.describe(credentialRef(credentialApiKeyEnv()))
    return { configured: info.configured, writable: info.writable }
  }
  const clearCredential = async () => {
    const credentials = ctx.get('credentials')
    if (!credentials) throw new Error('credentials service unavailable: cannot clear an API key')
    await credentials.unset(credentialRef(credentialApiKeyEnv()))
    const info = await credentials.describe(credentialRef(credentialApiKeyEnv()))
    return { configured: info.configured, writable: info.writable }
  }
  // Plan selection persists in the same Host credentials document as the API
  // key (`.credentials.yaml`), using a dedicated non-secret reference.
  const PLAN_REF = credentialRef('COMMANDCODE_PLAN_ID')
  // Fail loudly: a broken credentials read must surface as a route error so
  // the UI can show an actionable failure instead of silently pretending the
  // user has no plan preference.
  const getPlanPreference = async () => {
    const credentials = ctx.get('credentials')
    if (!credentials) {
      throw new Error('credentials service unavailable: cannot read plan preference')
    }
    const hit = await credentials.resolve(PLAN_REF)
    return hit?.value ?? ''
  }
  const setPlanPreference = async (planId: string) => {
    const credentials = ctx.get('credentials')
    if (!credentials) throw new Error('credentials service unavailable: cannot persist plan preference')
    await credentials.set(PLAN_REF, planId)
  }
  const clearPlanPreference = async () => {
    const credentials = ctx.get('credentials')
    if (!credentials) return
    await credentials.unset(PLAN_REF)
  }
  const testCredential = async () => {
    const key = await resolveApiKey({ ctx, apiKeyEnv: credentialApiKeyEnv(), literalApiKey: cfg().apiKey || undefined })
    if (!key) return { ok: false, error: 'not-configured' }
    const probe = new CommandCodeClient({
      resolveApiKey: async () => key,
      options: () => ({ apiBase: cfg().apiBase, requestTimeoutMs: cfg().requestTimeoutMs }),
    })
    try {
      const report = await probe.getUsageReport(key)
      if (report.account || report.usage || report.credits || report.blocked === undefined || report.failures.length === 0) {
        return { ok: true }
      }
      return { ok: false, error: report.failures.join('; ') }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  const store = new UsageStore()
  const client = new CommandCodeClient({
    resolveApiKey: makeResolveApiKey(ctx, cfg),
    options: () => ({
      apiBase: cfg().apiBase,
      requestTimeoutMs: cfg().requestTimeoutMs,
    }),
  })

  // Accounts list from config: default + extras.
  const accounts = () => {
    const c = cfg()
    const list = [{ id: 'default', label: 'Default', configured: true }]
    for (let i = 0; i < c.accounts.length; i++) {
      const a = c.accounts[i]!
      const id = a.apiKeyEnv ?? `account-${i + 2}`
      list.push({ id, label: a.label || `Account ${i + 2}`, configured: true })
    }
    return list.map((slot) => ({
      ...slot,
      usable: true,
      cooldownUntil: 0,
      mark: 'ok' as const,
    }))
  }

  const poller = new UsagePoller({
    client,
    store,
    accounts,
    pollIntervalMs: cfg().pollIntervalMs,
    errorBackoffMs: cfg().errorBackoffMs,
    accountConcurrency: cfg().accountConcurrency,
  })

  // Lifecycle: start poller, register routes, session watcher, command, UI routes.
  ctx.effect(() => {
    poller.start()
    const disposeRoutes = cfg().enableRoutes ? registerUsageRoutes(ctx, store) : () => {}
    const disposeUiRoutes = registerUiRoutes(ctx, {
      describeCredential,
      setCredential,
      clearCredential,
      testCredential,
      refreshStatus: () => poller.runNow(),
      getPlanPreference,
      setPlanPreference,
      clearPlanPreference,
    })
    let disposeWatcher: (() => void) | undefined
    if (cfg().enableSessionCost) {
      disposeWatcher = applySessionWatcher(ctx, { store })
    }
    return () => {
      poller.stop()
      disposeRoutes()
      disposeUiRoutes()
      disposeWatcher?.()
    }
  }, 'commandcode-usage-monitor: poller, routes, watcher, ui routes')

  // The CMDAI UI preferences namespace: the browser settings page edits it
  // through the client settings scope; the Host keeps the source for host-side
  // dynamic behavior.
  let uiSource: () => ConfigType['ui'] = () => cfg().ui ?? {}
  installSettingsSection(ctx, UI_SETTINGS_NAMESPACE, UiConfig, cfg().ui ?? {}, {
    setSource: (source) => {
      uiSource = source
    },
    onChange: () => {},
  })

  // The `/commandcode-usage` command rides the optional `commands` service:
  // a child fiber injects it, so registrations are cleaned up automatically
  // when this plugin unloads.
  ctx.inject(['commands'], (commandCtx) => {
    applyCommands(commandCtx, {
      store,
      refresh: () => poller.runNow(),
    })
  })
}
