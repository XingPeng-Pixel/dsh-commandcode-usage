/**
 * Session watcher: aggregates per-turn Command Code usage from session events.
 *
 * The DSH session event stream carries real model usage on `assistant/message`
 * events (`data.usage`). This watcher buckets usage by (sessionId, turn) and
 * finalizes on `turn/end`, publishing a TurnCostSnapshot with a monotonically
 * increasing seq for the frontend to detect new turns.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { UsageStore } from './store.ts'
import type { ObservedTurnUsage } from './types.ts'

interface TurnAggregate {
  turn: number
  tokens: number
  cost: number
  lastTs: number
  model: string
}

export interface SessionWatcherDeps {
  store: UsageStore
  /** Optional pricing conversion; if omitted, only tokens are reported. */
  costFor?: (usage: ObservedTurnUsage) => number
}

export class SessionWatcher {
  private readonly aggregates = new Map<string, TurnAggregate>()
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly ctx: Context,
    private readonly deps: SessionWatcherDeps,
  ) {}

  start(): void {
    this.disposers.push(this.ctx.on('session/event', (session, event) => {
      const sid = this.sessionId(session)
      this.handleSessionEvent(sid, event)
    }))
    this.disposers.push(this.ctx.on('session/disposed', (session) => {
      this.aggregates.delete(this.sessionId(session))
    }))
  }

  stop(): void {
    for (const dispose of this.disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
    this.disposers.length = 0
    this.aggregates.clear()
  }

  private sessionId(session: unknown): string {
    if (session && typeof session === 'object' && 'id' in session) {
      const id = (session as { id: unknown }).id
      if (typeof id === 'string' && id !== '') return id
    }
    return 'default'
  }

  private handleSessionEvent(sessionId: string, event: unknown): void {
    if (!event || typeof event !== 'object') return
    const e = event as { type?: unknown; data?: unknown }
    const type = e.type
    const data = e.data
    if (typeof data !== 'object' || data === null) return

    if (type === 'turn/end') {
      this.finalize(sessionId)
      return
    }
    if (type !== 'assistant/message') return

    const d = data as Record<string, unknown>
    const turn = Number(d.turn)
    const usage = d.usage
    if (!Number.isFinite(turn) || typeof usage !== 'object' || usage === null) return

    const u = usage as Record<string, unknown>
    const input = Number(u.inputTokens) || 0
    const cache = Number(u.cacheReadTokens) || 0
    const output = Number(u.outputTokens) || 0
    const reasoning = Number(u.reasoningTokens) || 0
    const message = d.message && typeof d.message === 'object' ? d.message as Record<string, unknown> : undefined
    const source = message?.source && typeof message.source === 'object' ? message.source as Record<string, unknown> : undefined
    const model = typeof source?.model === 'string' ? source.model : ''

    let agg = this.aggregates.get(sessionId)
    if (!agg || agg.turn !== turn) {
      if (agg) this.finalize(sessionId)
      agg = { turn, tokens: 0, cost: 0, lastTs: Date.now(), model }
      this.aggregates.set(sessionId, agg)
    }
    agg.tokens += input + cache + output + reasoning
    agg.lastTs = Date.now()
    if (model) agg.model = model

    if (this.deps.costFor) {
      agg.cost += this.deps.costFor({
        turn,
        inputTokens: input,
        cacheReadTokens: cache,
        outputTokens: output,
        reasoningTokens: reasoning,
        model,
        ts: Date.now(),
      })
    }
  }

  private finalize(sessionId: string): void {
    const agg = this.aggregates.get(sessionId)
    if (agg) {
      this.deps.store.publishTurnCost(
        agg.turn,
        this.deps.costFor ? agg.cost : null,
        agg.tokens,
        agg.lastTs,
      )
      this.aggregates.delete(sessionId)
    }
  }
}

/** Register the watcher on a context (child of the plugin fiber). */
export function applySessionWatcher(ctx: Context, deps: SessionWatcherDeps): () => void {
  const watcher = new SessionWatcher(ctx, deps)
  watcher.start()
  return () => watcher.stop()
}
