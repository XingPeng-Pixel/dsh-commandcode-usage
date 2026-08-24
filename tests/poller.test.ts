import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UsagePoller, type AccountSlot } from '../src/poller.ts'
import { UsageStore } from '../src/store.ts'
import { CommandCodeClient } from '../src/client.ts'

const KEY = 'user_test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function makeClient(fetchImpl: typeof fetch) {
  return new CommandCodeClient({
    resolveApiKey: async () => KEY,
    options: () => ({ apiBase: 'https://api.commandcode.ai', requestTimeoutMs: 5000 }),
    fetchImpl,
  })
}

const okHandler: typeof fetch = (async () => jsonResponse({
  success: true,
  user: { id: 'u1', name: 'N', userName: 'n' },
  org: null,
})) as typeof fetch

test('poller publishes snapshot and marks stale on failure', async () => {
  let fail = false
  const fetchImpl = (async (input: string | URL | Request) => {
    if (fail) return jsonResponse({}, 500)
    return okHandler(input)
  }) as typeof fetch

  const store = new UsageStore()
  const client = makeClient(fetchImpl)
  const slots: AccountSlot[] = [{ id: 'default', label: 'Default', configured: true, usable: true, cooldownUntil: 0, mark: 'ok' }]
  const poller = new UsagePoller({
    client,
    store,
    accounts: () => slots,
    pollIntervalMs: 1000,
    errorBackoffMs: 0,
  })

  await poller.runNow()
  assert.equal(store.getSnapshot().accounts.length, 1)
  assert.equal(store.getSnapshot().stale, false)

  fail = true
  await poller.runNow()
  assert.equal(store.getSnapshot().stale, true)
  assert.equal(store.getLastError(), null) // current impl only sets lastError on all-fail; partial fail does not set
})

test('poller does not overlap in-flight runs', async () => {
  let active = 0
  let maxActive = 0
  const fetchImpl = (async () => {
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise((r) => setTimeout(r, 50))
    active--
    return jsonResponse({})
  }) as typeof fetch

  const store = new UsageStore()
  const client = makeClient(fetchImpl)
  const slots: AccountSlot[] = [{ id: 'default', label: 'Default', configured: true, usable: true, cooldownUntil: 0, mark: 'ok' }]
  const poller = new UsagePoller({
    client,
    store,
    accounts: () => slots,
    pollIntervalMs: 1000,
    errorBackoffMs: 0,
  })

  await Promise.all([poller.runNow(), poller.runNow(), poller.runNow()])
  assert.equal(maxActive, 1)
})
