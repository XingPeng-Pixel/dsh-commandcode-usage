/**
 * In-memory store for the latest Command Code usage snapshot and per-turn cost.
 *
 * The store is intentionally dumb: it only owns the latest immutable values
 * and a revision counter. Producers (poller/session-watcher) call update
 * methods; consumers call getters. Every update replaces the object reference
 * instead of mutating in place, so a reader always sees a consistent snapshot.
 */

import type {
  AccountUsage,
  CommandCodeUsageSnapshot,
  TurnCostSnapshot,
} from './types.ts'

export interface UsageStoreEvents {
  onUpdate?: (snapshot: CommandCodeUsageSnapshot) => void
  onTurnCost?: (turn: TurnCostSnapshot) => void
  onError?: (error: { accountId?: string; message: string }) => void
}

const EMPTY_SNAPSHOT: CommandCodeUsageSnapshot = {
  updatedAt: 0,
  stale: true,
  accounts: [],
}

const EMPTY_TURN: TurnCostSnapshot = {
  seq: 0,
  turn: null,
  amount: null,
  tokens: null,
  ts: null,
}

export class UsageStore {
  private snapshot: CommandCodeUsageSnapshot = EMPTY_SNAPSHOT
  private turnCost: TurnCostSnapshot = EMPTY_TURN
  private lastError: string | null = null
  private revision = 0

  constructor(private readonly events: UsageStoreEvents = {}) {}

  getSnapshot(): CommandCodeUsageSnapshot {
    return this.snapshot
  }

  getTurnCost(): TurnCostSnapshot {
    return this.turnCost
  }

  getLastError(): string | null {
    return this.lastError
  }

  getRevision(): number {
    return this.revision
  }

  /** Replace the whole snapshot. */
  updateSnapshot(next: CommandCodeUsageSnapshot): void {
    this.snapshot = next
    this.revision++
    this.events.onUpdate?.(next)
  }

  /** Convenience: build a snapshot from account list + timestamps. */
  publishAccounts(accounts: AccountUsage[], updatedAt: number, stale: boolean): void {
    this.updateSnapshot({ updatedAt, stale, accounts })
  }

  /** Replace the per-turn cost record and bump its seq. */
  publishTurnCost(turn: number | null, amount: number | null, tokens: number | null, ts: number | null): void {
    const next: TurnCostSnapshot = {
      seq: this.turnCost.seq + 1,
      turn,
      amount,
      tokens,
      ts,
    }
    this.turnCost = next
    this.events.onTurnCost?.(next)
  }

  /** Record a non-fatal error (does not clear the snapshot). */
  setError(message: string, accountId?: string): void {
    this.lastError = message
    this.events.onError?.({ accountId, message })
  }

  clearError(): void {
    this.lastError = null
  }

  /** Load a persisted snapshot at startup; mark stale so consumers know it is not fresh. */
  hydrate(snapshot: CommandCodeUsageSnapshot | null, turnCost: TurnCostSnapshot | null): void {
    if (snapshot && Array.isArray(snapshot.accounts)) {
      this.snapshot = { ...snapshot, stale: true }
    }
    if (turnCost && typeof turnCost.seq === 'number') {
      this.turnCost = turnCost
    }
  }
}
