/**
 * Config + Schemastery schema for dsh-commandcode-usage-monitor.
 */

import z from '@deepseek-ai/schemastery'

export interface AccountConfig {
  label?: string
  apiKeyEnv?: string
  apiKey?: string
}

/** Browser-side UI preferences surfaced by the CMDAI settings page. */
export interface UiConfig {
  /** Whether the sidebar footer mini widget is enabled. */
  showWidget?: boolean
  /** Whether a per-turn cost toast is shown. */
  notifyTurnCost?: boolean
  /** Status polling interval in ms (clamped by the client). */
  pollIntervalMs?: number
  /** Auto-close delay for the per-turn toast, ms (0 = manual close). */
  turnCostCloseMs?: number
}

export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `COMMANDCODE_API_KEY`. */
  apiKeyEnv?: string
  /** Literal API key override (composition config only). */
  apiKey?: string
  /** API base; defaults to the public Command Code Provider API. */
  apiBase?: string
  /** Poll interval in milliseconds; default 60s (conservative for rate limits). */
  pollIntervalMs?: number
  /** Minimum delay after a failed poll before retrying; default 15s. */
  errorBackoffMs?: number
  /** Max accounts fetched in parallel per poll; default 1 (serial, conservative). */
  accountConcurrency?: number
  /** Per-request timeout in milliseconds; default 15s. */
  requestTimeoutMs?: number
  /** Extra accounts. */
  accounts?: AccountConfig[]
  /** Fixed active account slot id (optional). */
  activeAccount?: string
  /** Whether to aggregate per-turn cost from session events; default true. */
  enableSessionCost?: boolean
  /** Whether to register webServer JSON routes; default true. */
  enableRoutes?: boolean
  /** Optional persistence path for the last snapshot/turn cost. */
  storagePath?: string
  /** Browser-side UI preferences (optional, editable in the settings page). */
  ui?: UiConfig
}

export const DEFAULT_API_BASE = 'https://api.commandcode.ai'
export const DEFAULT_API_KEY_ENV = 'COMMANDCODE_API_KEY'
export const DEFAULT_POLL_INTERVAL_MS = 60_000
export const DEFAULT_ERROR_BACKOFF_MS = 15_000
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
export const DEFAULT_ACCOUNT_CONCURRENCY = 1
export const DEFAULT_CLI_VERSION = '1.32.1'

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  apiKey: z.string(),
  apiBase: z.string(),
  pollIntervalMs: z.number().min(1000).max(86_400_000),
  errorBackoffMs: z.number().min(0).max(86_400_000),
  requestTimeoutMs: z.number().min(1_000).max(300_000),
  accountConcurrency: z.number().min(1).max(10),
  accounts: z.array(z.object({
    label: z.string(),
    apiKeyEnv: z.string().role('credential-ref'),
    apiKey: z.string(),
  })),
  activeAccount: z.string(),
  enableSessionCost: z.boolean(),
  enableRoutes: z.boolean(),
  storagePath: z.string(),
  ui: z.object({
    showWidget: z.boolean(),
    notifyTurnCost: z.boolean(),
    pollIntervalMs: z.number().min(1000).max(86_400_000),
    turnCostCloseMs: z.number().min(0).max(600_000),
  }),
})

export function resolveConfig(config: Config): Required<Config> {
  return {
    apiKeyEnv: config.apiKeyEnv ?? DEFAULT_API_KEY_ENV,
    apiKey: config.apiKey ?? '',
    apiBase: config.apiBase ?? DEFAULT_API_BASE,
    pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    errorBackoffMs: config.errorBackoffMs ?? DEFAULT_ERROR_BACKOFF_MS,
    requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    accountConcurrency: config.accountConcurrency ?? DEFAULT_ACCOUNT_CONCURRENCY,
    accounts: config.accounts ?? [],
    activeAccount: config.activeAccount ?? '',
    enableSessionCost: config.enableSessionCost ?? true,
    enableRoutes: config.enableRoutes ?? true,
    storagePath: config.storagePath ?? '',
    ui: config.ui ?? {},
  }
}
