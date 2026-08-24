/**
 * Command Code account usage client.
 *
 * Wraps the official CLI's internal `/alpha/*` account endpoints. These are
 * not part of the public Provider API contract, but they are what the official
 * CLI `/usage` command calls. We keep the requests conservative:
 *  - one in-flight snapshot per account
 *  - no retries on 4xx
 *  - at most one retry on transient (network / 5xx)
 *  - every request bounded by AbortSignal.timeout
 *  - partial failures degrade the report instead of failing the whole account
 */

import {
  EMPTY_USAGE_REPORT,
  type CommandCodeAccount,
  type CommandCodeCredits,
  type CommandCodePlan,
  type CommandCodeUsage,
  type CommandCodeUsageReport,
  type UsageBlockReason,
} from './types.ts'
import { DEFAULT_CLI_VERSION } from './config.ts'

export interface CommandCodeClientOptions {
  apiBase: string
  apiKey: string
  cliVersion?: string
  requestTimeoutMs?: number
  fetchImpl?: typeof fetch
}

export interface CommandCodeClientDeps {
  /** Resolve the API key for an account; returns undefined when absent. */
  resolveApiKey: (accountId: string) => Promise<string | undefined>
  /** Build per-request options (apiBase etc.). */
  options: () => { apiBase: string; requestTimeoutMs: number }
  fetchImpl?: typeof fetch
}

const USAGE_ENDPOINT_COUNT = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseWindowLimit(value: unknown): { used: number; cap: number; exceeded: boolean; resetAt: number } | undefined {
  if (!isRecord(value)) return undefined
  return {
    used: numberValue(value.used) ?? 0,
    cap: numberValue(value.cap) ?? 0,
    exceeded: value.exceeded === true,
    resetAt: numberValue(value.resetAt) ?? 0,
  }
}

export class CommandCodeClient {
  constructor(private readonly deps: CommandCodeClientDeps) {}

  private get fetchImpl(): typeof fetch {
    return this.deps.fetchImpl ?? fetch
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      Authorization: `Bearer ${apiKey}`,
      'x-command-code-version': DEFAULT_CLI_VERSION,
      'x-cli-environment': 'production',
      'content-type': 'application/json',
    }
  }

  private async getJson(
    apiKey: string,
    path: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown> | undefined> {
    const res = await this.fetchImpl(`${this.deps.options().apiBase}${path}`, {
      headers: this.headers(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      const error: Error & { status?: number } = new Error(`HTTP ${res.status}`)
      error.status = res.status
      throw error
    }
    const parsed: unknown = await res.json().catch((cause: unknown) => {
      const error: Error & { status?: number; parseError?: boolean } = new Error(
        `invalid JSON from ${path}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      // Mark as a local parse failure, not a transport failure.
      error.status = 0
      error.parseError = true
      throw error
    })
    return isRecord(parsed) ? parsed : undefined
  }

  /**
   * Fetch one account's full usage report. Each endpoint degrades
   * independently: failures land in `report.failures`, while successful
   * endpoints still contribute fields.
   */
  async getUsageReport(apiKey: string): Promise<CommandCodeUsageReport> {
    const { requestTimeoutMs } = this.deps.options()
    const failures: string[] = []
    const failedStatuses: Array<number | undefined> = []
    const report: CommandCodeUsageReport = { failures }

    const getJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
      try {
        return await this.getJsonOnce(apiKey, path, requestTimeoutMs)
      } catch (error: unknown) {
        const status = (error as { status?: number })?.status
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
        failedStatuses.push(status)
        return undefined
      }
    }

    // whoami
    const whoami = await getJson('/alpha/whoami')
    const whoamiData = whoami && isRecord(whoami.user) ? whoami.user : undefined
    if (whoamiData) {
      const account: CommandCodeAccount = {
        id: stringValue(whoamiData.id) ?? '',
        name: stringValue(whoamiData.name) ?? '',
        userName: stringValue(whoamiData.userName) ?? '',
      }
      report.account = account
    }
    const orgData = whoami && isRecord(whoami.org) ? whoami.org : undefined
    const orgId = orgData === undefined ? undefined : stringValue(orgData.id)

    // usage summary
    const usage = await getJson('/alpha/usage/summary')
    if (usage) {
      const u: CommandCodeUsage = {
        totalCount: numberValue(usage.totalCount) ?? 0,
        totalCost: numberValue(usage.totalCost) ?? 0,
        successRate: numberValue(usage.successRate) ?? 0,
        completedCount: numberValue(usage.completedCount) ?? 0,
        failedCount: numberValue(usage.failedCount) ?? 0,
        totalTokensIn: numberValue(usage.totalTokensIn) ?? 0,
        totalTokensOut: numberValue(usage.totalTokensOut) ?? 0,
        totalCredits: numberValue(usage.totalCredits) ?? 0,
        periodBasis: stringValue(usage.periodBasis) ?? 'billing-period',
      }
      report.usage = u
    }

    // billing credits + window limits
    const credits = await getJson('/alpha/billing/credits')
    const creditsData = credits && isRecord(credits.credits) ? credits.credits : undefined
    const windowLimits = credits && isRecord(credits.windowLimits) ? credits.windowLimits : undefined
    const fiveHour = parseWindowLimit(windowLimits && isRecord(windowLimits.fiveHour) ? windowLimits.fiveHour : undefined)
    const weekly = parseWindowLimit(windowLimits && isRecord(windowLimits.weekly) ? windowLimits.weekly : undefined)
    if (creditsData || fiveHour || weekly) {
      const c: CommandCodeCredits = {
        monthlyCredits: numberValue(creditsData?.monthlyCredits) ?? 0,
        purchasedCredits: numberValue(creditsData?.purchasedCredits) ?? 0,
        freeCredits: numberValue(creditsData?.freeCredits) ?? 0,
        fiveHour: fiveHour ?? { used: 0, cap: 0, exceeded: false, resetAt: 0 },
        weekly: weekly ?? { used: 0, cap: 0, exceeded: false, resetAt: 0 },
      }
      report.credits = c
    }

    // billing subscriptions
    const subscription = await getJson(orgId === undefined
      ? '/alpha/billing/subscriptions'
      : `/alpha/billing/subscriptions?orgId=${encodeURIComponent(orgId)}`)
    const subData = subscription && isRecord(subscription.data) ? subscription.data : undefined
    const planId = stringValue(subData?.planId) ?? stringValue(creditsData?.planId)
    if (subData !== undefined || planId !== undefined) {
      const p: CommandCodePlan = {
        planId: planId ?? '',
        name: planId ?? '',
        status: stringValue(subData?.status) ?? '',
        // subscriptions doesn't always carry monthlyCredits; fall back to the
        // credits payload which is authoritative for the current balance.
        monthlyCredits: numberValue(subData?.monthlyCredits) ?? numberValue(creditsData?.monthlyCredits) ?? null,
        currentPeriodEnd: numberValue(subData?.currentPeriodEnd) ?? 0,
      }
      report.plan = p
    }

    // Classify total failure
    if (failures.length === USAGE_ENDPOINT_COUNT) {
      const codes = failedStatuses.filter((s): s is number => s !== undefined && s > 0)
      if (codes.length === USAGE_ENDPOINT_COUNT && codes.every((code) => code === 401)) {
        report.blocked = 'invalid-key'
      } else if (codes.length === USAGE_ENDPOINT_COUNT && codes.every((code) => code >= 500)) {
        report.blocked = 'service-unavailable'
      } else if (failedStatuses.every((s) => s === undefined)) {
        // Only classify as network when every endpoint failed with a transport
        // error (no HTTP status at all). Parse errors are marked status 0 and
        // therefore do not count as network.
        report.blocked = 'network'
      }
    }

    return report
  }

  /**
   * Probe one account's five-hour window (used by multi-account revival).
   * Returns undefined when the endpoint/shape fails.
   */
  async probeFiveHourWindow(apiKey: string): Promise<{ exceeded: boolean; resetAt: number } | undefined> {
    try {
      const { requestTimeoutMs } = this.deps.options()
      const parsed = await this.getJson(apiKey, '/alpha/billing/credits', requestTimeoutMs)
      const windowLimits = parsed && isRecord(parsed.windowLimits) ? parsed.windowLimits : undefined
      const fiveHour = windowLimits && isRecord(windowLimits.fiveHour) ? windowLimits.fiveHour : undefined
      if (fiveHour === undefined) return undefined
      return { exceeded: fiveHour.exceeded === true, resetAt: numberValue(fiveHour.resetAt) ?? 0 }
    } catch {
      return undefined
    }
  }

  /** Single GET with one transient retry (network/5xx only). */
  private async getJsonOnce(
    apiKey: string,
    path: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown> | undefined> {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.getJson(apiKey, path, timeoutMs)
      } catch (error: unknown) {
        lastError = error
        const status = (error as { status?: number })?.status
        const parseError = (error as { parseError?: boolean })?.parseError === true
        // 4xx and parse errors: no retry
        if (parseError || (typeof status === 'number' && status >= 400 && status < 500)) throw error
        // transport/5xx: retry once after a short pause
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 500))
          continue
        }
        throw error
      }
    }
    throw lastError
  }

  /**
   * Resolve an account's key and fetch its report, degrading to a failure-only
   * report when no key is configured.
   */
  async fetchAccount(accountId: string, label: string): Promise<{
    id: string
    label: string
    configured: boolean
    report: CommandCodeUsageReport
  }> {
    const apiKey = await this.deps.resolveApiKey(accountId)
    if (!apiKey) {
      return { id: accountId, label, configured: false, report: EMPTY_USAGE_REPORT }
    }
    try {
      const report = await this.getUsageReport(apiKey)
      return { id: accountId, label, configured: true, report }
    } catch (error: unknown) {
      return {
        id: accountId,
        label,
        configured: true,
        report: { failures: [error instanceof Error ? error.message : String(error)] },
      }
    }
  }
}

export type { UsageBlockReason }
