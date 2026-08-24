import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CommandCodeClient } from '../src/client.ts'

const KEY = 'user_test'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeClient(handler: (url: string) => Response | Promise<Response>) {
  return new CommandCodeClient({
    resolveApiKey: async () => KEY,
    options: () => ({ apiBase: 'https://api.commandcode.ai', requestTimeoutMs: 5000 }),
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      return handler(url)
    }) as typeof fetch,
  })
}

test('getUsageReport parses all four endpoints', async () => {
  const calls: string[] = []
  const client = makeClient((url) => {
    calls.push(url)
    if (url.includes('/alpha/whoami')) {
      return jsonResponse({ success: true, user: { id: 'u1', name: 'Mars', userName: 'mars' }, org: { id: 'org1' } })
    }
    if (url.includes('/alpha/usage/summary')) {
      return jsonResponse({ totalCount: 10, totalCost: 1.2, successRate: 100, completedCount: 10, failedCount: 0, totalTokensIn: 100, totalTokensOut: 50, totalCredits: 1.2, periodBasis: 'billing-period' })
    }
    if (url.includes('/alpha/billing/credits')) {
      return jsonResponse({ credits: { monthlyCredits: 10, purchasedCredits: 0, freeCredits: 0 }, windowLimits: { fiveHour: { used: 2, cap: 14, exceeded: false, resetAt: 1000 }, weekly: { used: 3, cap: 35, exceeded: false, resetAt: 2000 } } })
    }
    if (url.includes('/alpha/billing/subscriptions')) {
      return jsonResponse({ success: true, data: { planId: 'individual-goat', status: 'active', currentPeriodEnd: 3000 } })
    }
    return jsonResponse({}, 404)
  })

  const report = await client.getUsageReport(KEY)
  assert.equal(report.account?.userName, 'mars')
  assert.equal(report.usage?.totalCount, 10)
  assert.equal(report.credits?.fiveHour.used, 2)
  assert.equal(report.plan?.planId, 'individual-goat')
  assert.equal(report.failures.length, 0)
  assert.equal(calls.some((u) => u.includes('orgId=org1')), true)
})

test('getUsageReport degrades partial failures and classifies all-401', async () => {
  const client = makeClient((url) => {
    if (url.includes('/alpha/whoami')) return jsonResponse({}, 401)
    if (url.includes('/alpha/usage/summary')) return jsonResponse({}, 401)
    if (url.includes('/alpha/billing/credits')) return jsonResponse({}, 401)
    if (url.includes('/alpha/billing/subscriptions')) return jsonResponse({}, 401)
    return jsonResponse({}, 404)
  })
  const report = await client.getUsageReport(KEY)
  assert.equal(report.blocked, 'invalid-key')
  assert.equal(report.failures.length, 4)
})

test('probeFiveHourWindow parses window limit', async () => {
  const client = makeClient(() => jsonResponse({
    credits: {},
    windowLimits: { fiveHour: { used: 5, cap: 14, exceeded: true, resetAt: 4000 } },
  }))
  const probe = await client.probeFiveHourWindow(KEY)
  assert.deepEqual(probe, { exceeded: true, resetAt: 4000 })
})

test('getUsageReport does not classify JSON parse failures as network', async () => {
  const client = makeClient(() => new Response('not-json', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const report = await client.getUsageReport(KEY)
  assert.equal(report.blocked, undefined)
  assert.equal(report.failures.length, 4)
})

test('fetchAccount returns configured false when no key', async () => {
  const client = new CommandCodeClient({
    resolveApiKey: async () => undefined,
    options: () => ({ apiBase: 'https://api.commandcode.ai', requestTimeoutMs: 5000 }),
  })
  const account = await client.fetchAccount('default', 'Default')
  assert.equal(account.configured, false)
  assert.equal(account.report.failures.length, 0)
})
