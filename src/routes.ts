/**
 * webServer JSON routes for the Command Code usage monitor.
 *
 * These routes are read-only and always return JSON (never hang / throw empty
 * responses). The browser/frontend polls them; the browser never sees API keys.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { UsageStore } from './store.ts'

export const API_PREFIX = '/commandcode-usage'

/** Always send a JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(JSON.stringify(body))
}

function getRoute(path: string, run: () => Record<string, unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (req.method !== 'GET') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      try {
        json(res, 200, { ok: true, ...run() })
      } catch (error: unknown) {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

export function makeUsageRoutes(store: UsageStore): WebRoute[] {
  return [
    getRoute(`${API_PREFIX}/status.json`, () => ({
      snapshot: store.getSnapshot(),
      revision: store.getRevision(),
      lastError: store.getLastError(),
    })),
    getRoute(`${API_PREFIX}/turn-cost.json`, () => {
      const turn = store.getTurnCost()
      return {
        seq: turn.seq,
        turn: turn.turn,
        amount: turn.amount,
        tokens: turn.tokens,
        ts: turn.ts,
      }
    }),
    getRoute(`${API_PREFIX}/health`, () => ({ healthy: true })),
  ]
}

/** Register all routes on ctx.webServer, returning a disposer for cleanup. */
export function registerUsageRoutes(ctx: { webServer: { register(route: WebRoute): () => void } }, store: UsageStore): () => void {
  const disposers = makeUsageRoutes(store).map((route) => ctx.webServer.register(route))
  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
  }
}
