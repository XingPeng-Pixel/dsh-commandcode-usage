/**
 * React data hooks for the CMDAI monitoring surface.
 *
 * The Widget and Settings page are pure consumers of the existing Host JSON
 * routes; these hooks own polling, latest-wins state, and per-turn seq
 * alignment for one page lifetime.
 */

import { useEffect, useRef, useState } from 'react'
import {
  fetchStatus,
  fetchTurnCost,
  refreshStatus,
  type AccountUsage,
  type Snapshot,
  type StatusResponse,
  type TurnCostResponse,
} from './api.ts'

/** Browser-wide event name used to poke every mounted `useMonitorStatus`. */
const REFRESH_EVENT = 'commandcode-usage:refresh'

/** Ask every mounted CMDAI monitor surface to re-fetch status now. */
export function requestMonitorRefresh(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
  }
}

/**
 * One host-side refresh per page/plugin boot.
 *
 * The Host poller usually starts immediately, but on a fast first load the
 * browser can mount the widget before the first poll finishes (or before any
 * account has been fetched), showing 0% and empty stats. Posting to the
 * plugin's refresh route once at boot asks the Host poller to run now and
 * avoids that blank first frame.
 */
let initialRefreshPromise: Promise<void> | null = null
function ensureInitialRefresh(): Promise<void> {
  if (!initialRefreshPromise) {
    initialRefreshPromise = refreshStatus().catch(() => {})
  }
  return initialRefreshPromise
}

export interface MonitorState {
  loading: boolean
  /** True while a status refresh request is in flight (initial or later poll). */
  refreshing: boolean
  snapshot: Snapshot | null
  statusCode: 'ok' | 'unconfigured' | 'invalid-key' | 'service-unavailable' | 'network' | 'error'
  message: string | null
  lastError: string | null
  lastUpdatedAt: number | null
  /** Force this hook instance to re-fetch status immediately. */
  refresh: () => void
}

const initialMonitor: MonitorState = {
  loading: true,
  refreshing: false,
  snapshot: null,
  statusCode: 'ok',
  message: null,
  lastError: null,
  lastUpdatedAt: null,
  refresh: () => {},
}

function classify(snapshot: Snapshot | null, statusResponse: StatusResponse | null): MonitorState['statusCode'] {
  if (!snapshot || snapshot.accounts.length === 0) return 'unconfigured'
  const first = snapshot.accounts[0]
  if (!first?.configured) return 'unconfigured'
  const blocked = first.report.blocked
  if (blocked === 'invalid-key') return 'invalid-key'
  if (blocked === 'service-unavailable') return 'service-unavailable'
  if (blocked === 'network') return 'network'
  if (first.mark === 'invalid-credential') return 'invalid-key'
  return 'ok'
}

/**
 * Poll `/commandcode-usage/status.json`. The interval is clamped to at least
 * 15s; a fetch failure keeps the previous snapshot and marks the message.
 */
export function useMonitorStatus(pollMs = 60_000): MonitorState {
  const [state, setState] = useState<MonitorState>(initialMonitor)
  const seq = useRef(0)
  const loadRef = useRef<() => Promise<void>>(async () => {})
  const firstLoad = useRef(true)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined

    const load = async (): Promise<void> => {
      const current = ++seq.current
      setState((prev) => ({ ...prev, loading: false, refreshing: true }))
      try {
        // On the very first load, ask the Host to run a poll NOW and wait for
        // it to finish before reading status. A fire-and-forget refresh can
        // race the first GET: the widget mounts before the Host store is
        // populated, reads an empty 0% snapshot, and then waits 60s for the
        // next interval.
        if (firstLoad.current) {
          firstLoad.current = false
          await ensureInitialRefresh()
        }
        const response = await fetchStatus()
        if (disposed || current !== seq.current) return
        setState((prev) => ({
          loading: false,
          refreshing: false,
          snapshot: response.snapshot,
          statusCode: classify(response.snapshot, response),
          message: null,
          lastError: response.lastError,
          lastUpdatedAt: response.snapshot.updatedAt,
          refresh: prev.refresh,
        }))
      } catch (error) {
        if (disposed || current !== seq.current) return
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          statusCode: 'error',
          message: error instanceof Error ? error.message : String(error),
        }))
      }
    }
    loadRef.current = load

    void load()
    timer = setInterval(() => { void load() }, Math.max(15_000, pollMs))
    const onRefresh = (): void => { void load() }
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => {
      disposed = true
      if (timer !== undefined) clearInterval(timer)
      window.removeEventListener(REFRESH_EVENT, onRefresh)
    }
  }, [pollMs])

  const refresh = (): void => { void loadRef.current() }

  return { ...state, refresh }
}

export interface TurnWatchState {
  turn: TurnCostResponse | null
  /** Monotonic latest seq seen. */
  lastSeq: number
  /** True when a turn arrived AFTER the initial alignment. */
  newTurn: boolean
}

/** Poll turn-cost enough to detect a new turn, without replaying old turns. */
export function useTurnWatch(pollMs = 2_000): TurnWatchState {
  const [state, setState] = useState<TurnWatchState>({ turn: null, lastSeq: 0, newTurn: false })
  const seq = useRef(0)
  const aligned = useRef(false)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setInterval> | undefined

    const load = async (): Promise<void> => {
      const current = ++seq.current
      try {
        const response = await fetchTurnCost()
        if (disposed || current !== seq.current) return
        setState((prev) => {
          if (!aligned.current) {
            // First read: align to whatever the Host currently reports.
            aligned.current = true
            return { turn: response, lastSeq: response.seq, newTurn: false }
          }
          if (response.seq > prev.lastSeq) {
            return { turn: response, lastSeq: response.seq, newTurn: true }
          }
          return { turn: response, lastSeq: prev.lastSeq, newTurn: false }
        })
      } catch {
        // Polling is best-effort; a transport error simply keeps the last view.
      }
    }

    void load()
    timer = setInterval(() => { void load() }, Math.max(1_000, pollMs))
    return () => {
      disposed = true
      if (timer !== undefined) clearInterval(timer)
    }
  }, [pollMs])

  return state
}

/** Choose the first visible account, falling back to any available one. */
export function primaryAccount(snapshot: Snapshot | null): AccountUsage | null {
  if (!snapshot || snapshot.accounts.length === 0) return null
  return snapshot.accounts[0] ?? null
}

/** Human-compact token formatting (K / M / B). */
export function compactNumber(value: number | null | undefined): string {
  const v = Number(value)
  if (!Number.isFinite(v)) return '--'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(Math.round(v))
}

export function money(value: number | null | undefined): string {
  const v = Number(value)
  if (!Number.isFinite(v)) return '--'
  return `$${v.toFixed(2)}`
}

export function ratio(value: number | null | undefined, cap: number | null | undefined): number {
  const v = Number(value)
  const c = Number(cap)
  if (!Number.isFinite(v) || !Number.isFinite(c) || c <= 0) return 0
  return Math.max(0, Math.min(1, v / c))
}
