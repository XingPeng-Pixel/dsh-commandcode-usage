/**
 * Command Code plan metadata.
 *
 * The official CLI carries this static plan table because `/alpha/billing/*`
 * reports *remaining* credits, not the plan's total monthly allowance. This
 * mirror keeps the UI able to compute "used this month" as:
 *
 *   used = planMonthlyCap(planId) - credits.monthlyCredits
 *
 * The mapping comes from the official Command Code CLI 1.15.1 bundle and the
 * public plan docs. It is intentionally a local lookup, not a network call.
 */

/** Monthly plan allowance (USD credits), keyed by normalized plan id. */
export const PLAN_MONTHLY_CAP: Record<string, number> = {
  'individual-go': 10,
  'individual-goat': 70,
  'individual-pro': 30,
  'individual-pro-v1': 80,
  'individual-provider': 15,
  'individual-max': 150,
  'individual-ultra': 300,
  'teams-pro': 40,
}

/** Human display names used by the CLI for the same plan ids. */
export const PLAN_NAMES: Record<string, string> = {
  'individual-go': 'Go',
  'individual-goat': 'GOAT',
  'individual-pro': 'Pro',
  'individual-pro-v1': 'Pro',
  'individual-provider': 'Provider',
  'individual-max': 'Max',
  'individual-ultra': 'Ultra',
  'teams-pro': 'Teams Pro',
}

/** Weekly usage cap per plan (from official docs / CLI window limits). */
export const PLAN_WEEKLY_CAP: Record<string, number> = {
  'individual-go': 3,
  'individual-goat': 35,
  'individual-pro': 60,
  'individual-pro-v1': 160,
  'individual-provider': 15,
  'individual-max': 300,
  'individual-ultra': 600,
  'teams-pro': 80,
}

/** Five-hour usage cap per plan (from official docs / CLI window limits). */
export const PLAN_FIVE_HOUR_CAP: Record<string, number> = {
  'individual-go': 2,
  'individual-goat': 14,
  'individual-pro': 20,
  'individual-pro-v1': 40,
  'individual-provider': 15,
  'individual-max': 80,
  'individual-ultra': 160,
  'teams-pro': 30,
}

/** Normalize a raw plan id so table lookups also match hyphens/underscores. */
export function normalizePlanId(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/_/g, '-')
}

/** Look up the official monthly cap, or undefined for an unknown plan. */
export function planMonthlyCap(planId: string | null | undefined): number | undefined {
  const value = PLAN_MONTHLY_CAP[normalizePlanId(planId)]
  return typeof value === 'number' ? value : undefined
}

/** Look up the official weekly cap, or undefined for an unknown plan. */
export function planWeeklyCap(planId: string | null | undefined): number | undefined {
  const value = PLAN_WEEKLY_CAP[normalizePlanId(planId)]
  return typeof value === 'number' ? value : undefined
}

/** Look up the official five-hour cap, or undefined for an unknown plan. */
export function planFiveHourCap(planId: string | null | undefined): number | undefined {
  const value = PLAN_FIVE_HOUR_CAP[normalizePlanId(planId)]
  return typeof value === 'number' ? value : undefined
}

/** Display name for a plan id, falling back to the raw id. */
export function planDisplayName(planId: string | null | undefined): string {
  const normalized = normalizePlanId(planId)
  return PLAN_NAMES[normalized] ?? planId ?? ''
}

/**
 * Compute this month's used credits when the plan is known.
 * The API's `credits.monthlyCredits` is the REMAINING monthly allowance, so:
 *   used = plan cap - remaining
 * Returns undefined when the plan is not in the official table.
 */
export function monthlyUsedCredits(
  planId: string | null | undefined,
  monthlyRemaining: number | null | undefined,
): number | undefined {
  const cap = planMonthlyCap(planId)
  const remaining = Number(monthlyRemaining)
  if (cap === undefined || !Number.isFinite(remaining)) return undefined
  return Math.max(0, cap - Math.max(0, remaining))
}
