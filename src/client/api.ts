/**
 * Same-origin JSON access to the Command Code usage monitor Host routes.
 *
 * The browser talks only to the plugin's own DSH web server routes. It never
 * receives or forwards a Command Code API key.
 */

import type { PlanOption } from '../plan.ts'

/** Progress-bar/limit shape returned by `/commandcode-usage/status.json`. */
export interface WindowLimit {
  used: number
  cap: number
  exceeded: boolean
  resetAt: number
}

export interface Credits {
  monthlyCredits: number
  purchasedCredits: number
  freeCredits: number
  fiveHour: WindowLimit
  weekly: WindowLimit
}

export interface Usage {
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

export interface AccountReport {
  account?: { id: string; name: string; userName: string }
  usage?: Usage
  credits?: Credits
  plan?: { planId: string; name: string; status: string; monthlyCredits: number | null; currentPeriodEnd: number }
  failures: string[]
  blocked?: 'invalid-key' | 'service-unavailable' | 'network'
}

export interface AccountUsage {
  id: string
  label: string
  configured: boolean
  active: boolean
  mark: 'ok' | 'rate-limit' | 'invalid-credential' | 'unknown'
  cooldownUntil: number
  report: AccountReport
}

export interface Snapshot {
  updatedAt: number
  stale: boolean
  accounts: AccountUsage[]
}

export interface StatusResponse {
  ok: boolean
  snapshot: Snapshot
  revision: number
  lastError: string | null
}

export interface TurnCostResponse {
  ok: boolean
  seq: number
  turn: number | null
  amount: number | null
  tokens: number | null
  ts: number | null
}

export interface CredentialStatus {
  configured: boolean
  writable: boolean
}

/** One option in the settings page Plan dropdown. */
export type PlanOptionDto = PlanOption

export interface PlansResponse {
  ok: boolean
  options: PlanOptionDto[]
}

async function getJson<T>(path: string, timeoutMs = 12000): Promise<T> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`)
  return (await response.json()) as T
}

/** Fetch the latest usage snapshot. */
export function fetchStatus(): Promise<StatusResponse> {
  return getJson<StatusResponse>('/commandcode-usage/status.json')
}

/** Fetch the last completed turn record. */
export function fetchTurnCost(): Promise<TurnCostResponse> {
  return getJson<TurnCostResponse>('/commandcode-usage/turn-cost.json')
}

/** Fetch the full Plan dropdown catalog exposed by the Host routes. */
export function fetchPlans(): Promise<PlansResponse> {
  return getJson<PlansResponse>('/commandcode-usage/plans.json')
}

/** Describe whether an API key is configured and whether the Host can write it. */
export function describeCredential(): Promise<CredentialStatus> {
  return getJson<CredentialStatus>('/commandcode-usage/credential.json')
}

/** Persist an API key through the Host credentials service. */
export async function setCredential(key: string): Promise<CredentialStatus> {
  const response = await fetch('/commandcode-usage/credential.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  })
  const body = (await response.json()) as { ok: boolean; configured?: boolean; writable?: boolean; error?: string }
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? 'write credential failed')
  return { configured: body.configured === true, writable: body.writable === true }
}

/** Remove the API key from the Host credentials service. */
export async function clearCredential(): Promise<CredentialStatus> {
  const response = await fetch('/commandcode-usage/credential.json', {
    method: 'DELETE',
  })
  const body = (await response.json()) as { ok: boolean; configured?: boolean; writable?: boolean; error?: string }
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? 'clear credential failed')
  return { configured: body.configured === true, writable: body.writable === true }
}

/** Probe whether the currently resolved key can reach the Command Code API. */
export async function testCredential(): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch('/commandcode-usage/credential-test.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const body = (await response.json()) as { ok: boolean; error?: string }
  return body.ok === true ? { ok: true } : { ok: false, message: body.error ?? 'test failed' }
}

/** Force the Host poller to fetch a fresh usage snapshot immediately. */
export async function refreshStatus(): Promise<void> {
  const response = await fetch('/commandcode-usage/refresh.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  if (!response.ok) throw new Error(`refresh status failed: ${response.status}`)
}

/** Read the persisted Plan id preference ('' = follow the account plan). */
export async function getPlanPreference(): Promise<string> {
  const body = await getJson<{ ok: boolean; planId?: string }>('/commandcode-usage/plan-preference.json')
  return body.planId ?? ''
}

/** Persist the selected Plan id through the Host credentials document. */
export async function setPlanPreference(planId: string): Promise<void> {
  const response = await fetch('/commandcode-usage/plan-preference.json', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planId }),
  })
  const body = (await response.json()) as { ok: boolean; error?: string }
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? 'write plan preference failed')
}

/** Clear the persisted Plan id preference (resume following the account plan). */
export async function clearPlanPreference(): Promise<void> {
  const response = await fetch('/commandcode-usage/plan-preference.json', {
    method: 'DELETE',
  })
  const body = (await response.json()) as { ok: boolean; error?: string }
  if (!response.ok || body.ok !== true) throw new Error(body.error ?? 'clear plan preference failed')
}
