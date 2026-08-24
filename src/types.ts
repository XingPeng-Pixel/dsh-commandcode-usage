/**
 * Shared data contracts for the Command Code usage monitor.
 *
 * These types are the stable contract consumed by:
 *  - the poller/store (Host side)
 *  - the HTTP JSON routes
 *  - the browser client
 */

/** Account identity from `/alpha/whoami`. */
export interface CommandCodeAccount {
  id: string
  name: string
  userName: string
}

/** Usage summary from `/alpha/usage/summary`. */
export interface CommandCodeUsage {
  totalCount: number
  totalCost: number
  successRate: number
  completedCount: number
  failedCount: number
  totalTokensIn: number
  totalTokensOut: number
  totalCredits: number
  periodBasis: string
}

/** Credit/limit state from `/alpha/billing/credits`. */
export interface CommandCodeWindowLimit {
  used: number
  cap: number
  exceeded: boolean
  resetAt: number
}

export interface CommandCodeCredits {
  monthlyCredits: number
  purchasedCredits: number
  freeCredits: number
  fiveHour: CommandCodeWindowLimit
  weekly: CommandCodeWindowLimit
}

/** Subscription plan state from `/alpha/billing/subscriptions`. */
export interface CommandCodePlan {
  planId: string
  name: string
  status: string
  monthlyCredits: number | null
  currentPeriodEnd: number
}

export type UsageBlockReason = 'invalid-key' | 'service-unavailable' | 'network'

/** One account's usage report (mirrors dsh-commandcode-provider's shape). */
export interface CommandCodeUsageReport {
  account?: CommandCodeAccount
  usage?: CommandCodeUsage
  credits?: CommandCodeCredits
  plan?: CommandCodePlan
  failures: string[]
  blocked?: UsageBlockReason
}

/** One account in the monitor's snapshot. */
export interface AccountUsage {
  id: string
  label: string
  configured: boolean
  active: boolean
  mark: 'ok' | 'rate-limit' | 'invalid-credential' | 'unknown'
  cooldownUntil: number
  report: CommandCodeUsageReport
}

/** The full snapshot exposed to consumers. */
export interface CommandCodeUsageSnapshot {
  updatedAt: number
  stale: boolean
  accounts: AccountUsage[]
}

/** Per-turn cost record (session watcher). */
export interface TurnCostSnapshot {
  seq: number
  turn: number | null
  amount: number | null
  tokens: number | null
  ts: number | null
}

/** One assistant/message usage payload observed from session events. */
export interface ObservedTurnUsage {
  turn: number
  inputTokens: number
  cacheReadTokens: number
  outputTokens: number
  reasoningTokens: number
  model: string
  ts: number
}

export const EMPTY_USAGE_REPORT: CommandCodeUsageReport = { failures: [] }
