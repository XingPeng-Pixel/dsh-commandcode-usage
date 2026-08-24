/**
 * Poller: schedules Command Code usage fetches with rate-limit awareness.
 *
 * Design goals:
 *  - Never fire overlapping requests (single in-flight snapshot per run).
 *  - Minimum interval between runs is enforced even when a run finishes early.
 *  - After an error, back off before retrying.
 */

import type { CommandCodeClient } from './client.ts'
import type { AccountUsage, CommandCodeUsageSnapshot } from './types.ts'
import type { UsageStore } from './store.ts'

export interface AccountSlot {
  id: string
  label: string
  configured: boolean
  /** Whether this slot is currently believed usable. */
  usable: boolean
  /** Cooldown until (ms), 0 = none. */
  cooldownUntil: number
  mark: 'ok' | 'rate-limit' | 'invalid-credential' | 'unknown'
}

export interface PollerOptions {
  client: CommandCodeClient
  store: UsageStore
  accounts: () => AccountSlot[]
  pollIntervalMs: number
  errorBackoffMs: number
  /** Max accounts fetched in parallel per poll; default 1. */
  accountConcurrency?: number
  /** Reserved for future rate-limit probing. */
  probeIntervalMs?: number
  /** Called on each successful fetch; may be used to clear pool marks. */
  onSuccess?: (snapshot: CommandCodeUsageSnapshot) => void
}

export class UsagePoller {
  private timer: ReturnType<typeof setInterval> | null = null
  private inFlight: Promise<void> | null = null
  private lastRunAt = 0
  private lastErrorAt = 0
  private disposed = false

  constructor(private readonly options: PollerOptions) {}

  start(): void {
    if (this.timer) return
    void this.runNow()
    this.timer = setInterval(() => {
      void this.runIfDue()
    }, Math.max(1000, this.options.pollIntervalMs))
  }

  stop(): void {
    this.disposed = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async runNow(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.doRun()
    try {
      await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  private async runIfDue(): Promise<void> {
    if (this.disposed || this.inFlight) return
    const now = Date.now()
    const sinceLast = now - this.lastRunAt
    if (sinceLast < this.options.pollIntervalMs) return
    // Backoff after an error: do not hammer a failing endpoint.
    if (this.lastErrorAt > 0 && now - this.lastErrorAt < this.options.errorBackoffMs) return
    await this.runNow()
  }

  private async doRun(): Promise<void> {
    const started = Date.now()
    this.lastRunAt = started
    const slots = this.options.accounts()
    if (slots.length === 0) {
      // Nothing configured: keep the store as-is, do not mark errors.
      return
    }

    // Serial fetch by default to be conservative with the upstream API. When
    // `accountConcurrency > 1`, fetch in small batches; a failure on one
    // account must not block the others.
    const concurrency = Math.max(1, Math.min(this.options.accountConcurrency ?? 1, slots.length))
    const entries: AccountUsage[] = []
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < slots.length) {
        const index = cursor++
        const slot = slots[index]!
        if (!slot.usable && slot.mark === 'invalid-credential') {
          entries.push({
            id: slot.id,
            label: slot.label,
            configured: slot.configured,
            active: false,
            mark: 'invalid-credential',
            cooldownUntil: 0,
            report: { failures: ['account marked invalid-credential; not fetched'] },
          })
          continue
        }
        const account = await this.options.client.fetchAccount(slot.id, slot.label)
        entries.push({
          id: slot.id,
          label: slot.label,
          configured: account.configured,
          active: false,
          mark: 'ok',
          cooldownUntil: 0,
          report: account.report,
        })
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()))

    const now = Date.now()
    const hadFailures = entries.some((e) => e.report.failures.length > 0)
    const snapshot: CommandCodeUsageSnapshot = {
      updatedAt: now,
      stale: hadFailures,
      accounts: entries,
    }

    this.options.store.publishAccounts(entries, now, hadFailures)
    this.options.onSuccess?.(snapshot)

    if (hadFailures) {
      this.lastErrorAt = now
    } else {
      this.lastErrorAt = 0
      this.options.store.clearError()
    }
  }
}
