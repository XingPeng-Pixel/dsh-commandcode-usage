/**
 * Same-origin routes for the CMDAI monitoring UI: credential presence/write
 * and a connection probe.
 *
 * The browser never receives a plaintext API key. `describe` returns only
 * configured/writable facts; `set`/`unset` write through the DSH credentials
 * service when one is mounted; `test` resolves the current key Host-side and
 * calls the same Command Code client used by the poller.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

export const UI_PREFIX = '/commandcode-usage'

interface CredentialFacts {
  configured: boolean
  writable: boolean
}

export interface UiRouteDeps {
  describeCredential: () => Promise<CredentialFacts>
  setCredential: (key: string) => Promise<CredentialFacts>
  clearCredential: () => Promise<CredentialFacts>
  testCredential: () => Promise<{ ok: boolean; error?: string }>
  /** Force a poller run and wait for it to finish. */
  refreshStatus: () => Promise<void>
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function makeUiRoutes(deps: UiRouteDeps): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: `${UI_PREFIX}/credential.json`,
      handler: async (req, res) => {
        try {
          if (req.method === 'GET') {
            json(res, 200, { ok: true, ...await deps.describeCredential() })
            return
          }
          if (req.method === 'POST') {
            const raw = await readBody(req)
            const parsed = JSON.parse(raw) as { key?: unknown }
            if (typeof parsed.key !== 'string' || parsed.key.trim() === '') {
              json(res, 400, { ok: false, error: 'key must be a non-empty string' })
              return
            }
            const facts = await deps.setCredential(parsed.key.trim())
            await deps.refreshStatus()
            json(res, 200, { ok: true, ...facts })
            return
          }
          if (req.method === 'DELETE') {
            const facts = await deps.clearCredential()
            await deps.refreshStatus()
            json(res, 200, { ok: true, ...facts })
            return
          }
          json(res, 405, { ok: false, error: 'method-not-allowed' })
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
    {
      kind: 'exact',
      path: `${UI_PREFIX}/credential-test.json`,
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') {
            json(res, 405, { ok: false, error: 'method-not-allowed' })
            return
          }
          const result = await deps.testCredential()
          // A successful probe is a good moment to force a status refresh, so
          // the dashboard and sidebar widget update without waiting for poll.
          if (result.ok) {
            await deps.refreshStatus()
          }
          json(res, 200, result.ok ? { ok: true } : { ok: false, error: result.error ?? 'test failed' })
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
    {
      kind: 'exact',
      path: `${UI_PREFIX}/refresh.json`,
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') {
            json(res, 405, { ok: false, error: 'method-not-allowed' })
            return
          }
          await deps.refreshStatus()
          json(res, 200, { ok: true })
        } catch (error) {
          json(res, 500, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  ]
}

/**
 * Register the UI routes, returning a combined disposer. Keeps the same
 * cleanup contract as the backend routes.
 */
export function registerUiRoutes(ctx: { webServer: { register(route: WebRoute): () => void } }, deps: UiRouteDeps): () => void {
  const disposers = makeUiRoutes(deps).map((route) => ctx.webServer.register(route))
  return () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* already disposed */ }
    }
  }
}
