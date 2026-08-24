/**
 * CMDAI monitoring settings page: first-level `settings.section`.
 *
 * Layout: API key configuration card first, then a dashboard with a circular
 * usage gauge plus horizontal bars for the usage windows, then aggregate stats.
 * The key form talks only to the Host credential routes; the dashboard talks
 * only to the same-origin status route.
 */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  clearCredential,
  describeCredential,
  setCredential,
  testCredential,
} from './api.ts'
import { monthlyUsedCredits, planFiveHourCap, planMonthlyCap, planWeeklyCap, planDisplayName, PLAN_OPTIONS } from '../plan.ts'
import { compactNumber, money, primaryAccount, ratio, requestMonitorRefresh, useMonitorStatus, useTurnWatch } from './use-monitor.ts'
import { clearPlanPreference, fetchPlans, getPlanPreference, setPlanPreference, type PlanOptionDto } from './api.ts'
import css from './monitor.module.css'

/** The inject face for the settings page: credential verbs and status refresh. */
export interface MonitorSettingsPageInjected {
  refresh: () => void
}

export type MonitorSettingsPageProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'commandcode-usage'>
  & InjectFace<MonitorSettingsPageInjected>

type KeyState =
  | { phase: 'idle' | 'saving' | 'testing'; configured: boolean; writable: boolean; message?: string }
  | { phase: 'unknown' }

function barColor(kind: 'fiveHour' | 'weekly' | 'monthly'): string {
  if (kind === 'fiveHour') return 'var(--cmda-monitor-blue)'
  if (kind === 'weekly') return 'var(--cmda-monitor-warn)'
  return 'var(--cmda-monitor-success)'
}

/** Human label for a plan option: friendly name, with raw id only for unknown plans. */
function planLabel(option: { id: string; name: string }): string {
  if (!option.name || option.name === option.id) return option.id
  return option.name
}

/** Summary line under the selector: shows the active plan in the same style. */
function planSummaryLabel(id: string, options: readonly { id: string; name: string }[]): string {
  const option = options.find((item) => item.id === id)
  if (option) return planLabel(option)
  const name = planDisplayName(id)
  return name && name !== id ? name : id
}

function WindowBar({ label, used, cap, color, t }: {
  label: string
  used: number | null | undefined
  cap: number | null | undefined
  color: string
  t: PropsLocale<'commandcode-usage'>['t']
}) {
  const r = ratio(used, cap)
  const pct = Math.round(r * 100)
  const usedText = `${Number(used).toFixed(2)}`
  const capText = `${Number(cap).toFixed(0)}`
  return (
    <div className={css.barRow}>
      <span className={css.barLabel}>{label}</span>
      <div className={css.barTrack}>
        <div className={css.barFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={css.barMeta}>{usedText} / {capText} · {t('settings.usedPct', { pct: String(pct) })}</span>
    </div>
  )
}

/**
 * Color the whole usage arc by how much of the monthly cap is used:
 *   < 40%  → blue
 *   40-70% → smooth blue → orange
 *   70-100% → smooth orange → red (warning)
 * Uses CSS `color-mix` with the plugin's own `--cmda-monitor-*` palette so the
 * colors still follow the dark-mode overrides defined in the stylesheet.
 */
function usageArcColor(pct: number): string {
  if (pct <= 0) return 'var(--cmda-monitor-blue)'
  if (pct >= 100) return 'var(--cmda-monitor-danger)'
  if (pct <= 40) return 'var(--cmda-monitor-blue)'
  if (pct < 70) {
    const t = (pct - 40) / 30
    return `color-mix(in srgb, var(--cmda-monitor-warn) ${Math.round(t * 100)}%, var(--cmda-monitor-blue))`
  }
  const t = (pct - 70) / 30
  return `color-mix(in srgb, var(--cmda-monitor-danger) ${Math.round(t * 100)}%, var(--cmda-monitor-warn))`
}

function UsageGauge({ used, cap, monthly, purchased, free, t }: {
  used: number | null | undefined
  cap: number | null | undefined
  monthly: number | null | undefined
  purchased: number | null | undefined
  free: number | null | undefined
  t: PropsLocale<'commandcode-usage'>['t']
}) {
  const r = ratio(used, cap)
  const pct = Math.round(r * 100)
  const radius = 72
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(1, r)) * circumference
  const remaining = Math.max(0, Number(cap) - Number(used))
  const arcColor = usageArcColor(pct)

  return (
    <div className={css.gaugeWrap}>
      <div className={css.gauge}>
        <svg className={css.gaugeSvg} width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`${pct}% ${t('settings.usedPct', { pct: String(pct) })}`}>
          <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--cmda-monitor-track)" strokeWidth="14" />
          <circle
            cx="90"
            cy="90"
            r={radius}
            fill="none"
            stroke={arcColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference - progress}`}
            transform="rotate(-90 90 90)"
            className={css.gaugeArc}
          />
        </svg>
        <div className={css.gaugeCenter}>
          <div className={css.gaugePercent}>{pct}%</div>
          <div className={css.gaugeMeta}>
            {t('settings.monthly')} {money(used)} / {money(cap)}
          </div>
          <div className={css.gaugeRemaining}>{t('settings.remaining')} {money(remaining)}</div>
        </div>
      </div>

      <div className={css.gaugeLegend}>
        <div className={css.gaugeLegendRow}>
          <span className={css.gaugeLegendLabel}><i className={`${css.gaugeDot} ${css.gaugeDotInfo}`} />{t('settings.monthly')}</span>
          <span>{money(monthly)}</span>
        </div>
        <div className={css.gaugeLegendRow}>
          <span className={css.gaugeLegendLabel}><i className={`${css.gaugeDot} ${css.gaugeDotWarn}`} />{t('settings.purchased')}</span>
          <span>{money(purchased)}</span>
        </div>
        <div className={css.gaugeLegendRow}>
          <span className={css.gaugeLegendLabel}><i className={`${css.gaugeDot} ${css.gaugeDotSuccess}`} />{t('settings.free')}</span>
          <span>{money(free)}</span>
        </div>
      </div>
    </div>
  )
}

/** The first-level settings section. */
export function MonitorSettingsPage({ t, refresh }: MonitorSettingsPageProps) {
  const monitor = useMonitorStatus(60_000)
  const turn = useTurnWatch(2_000)
  const account = primaryAccount(monitor.snapshot)
  const report = account?.report
  const credits = report?.credits
  const usage = report?.usage
  const plan = report?.plan

  const currentPlanId = plan?.planId ?? ''

  const [keyDraft, setKeyDraft] = useState('')
  const [keyState, setKeyState] = useState<KeyState>({ phase: 'unknown' })
  const [testResult, setTestResult] = useState<string | null>(null)
  // Seed from the shared catalog so the dropdown is populated even before
  // `/plans.json` resolves.
  const [planOptions, setPlanOptions] = useState<PlanOptionDto[]>(PLAN_OPTIONS)
  const [planPreference, setPlanPreference] = useState<string | null>(null)
  const [planSaveState, setPlanSaveState] = useState<'idle' | 'saving' | 'saved' | 'cleared' | 'failed'>('idle')
  const [planLoadState, setPlanLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [planLoadError, setPlanLoadError] = useState<string | null>(null)
  const userEditedPlan = useRef(false)

  useEffect(() => {
    let disposed = false
    describeCredential().then(
      (status) => { if (!disposed) setKeyState({ phase: 'idle', configured: status.configured, writable: status.writable }) },
      () => { if (!disposed) setKeyState({ phase: 'unknown' }) },
    )
    fetchPlans().then(
      (response) => { if (!disposed) setPlanOptions(response.options.length > 0 ? response.options : PLAN_OPTIONS) },
      () => {},
    )
    getPlanPreference().then(
      (value) => {
        if (disposed) return
        if (!userEditedPlan.current) setPlanPreference(value)
        setPlanLoadState('ready')
      },
      (error) => {
        if (disposed) return
        setPlanLoadState('error')
        setPlanLoadError(error instanceof Error ? error.message : String(error))
      },
    )
    return () => { disposed = true }
  }, [])

  const activePlanId = (planPreference && planPreference.length > 0)
    ? planPreference
    : currentPlanId

  const effectivePlanId = activePlanId || currentPlanId
  const monthCap = planMonthlyCap(effectivePlanId)
    ?? (usage?.totalCost ?? 0) + (credits?.monthlyCredits ?? 0)
  const monthUsed = monthlyUsedCredits(effectivePlanId, credits?.monthlyCredits)
    ?? (usage?.totalCost ?? 0)
  const window5hCap = planFiveHourCap(effectivePlanId) ?? credits?.fiveHour.cap ?? 0
  const weeklyCap = planWeeklyCap(effectivePlanId) ?? credits?.weekly.cap ?? 0

  const knownPlanIds = new Set(planOptions.map((option) => option.id))
  const unknownActivePlan = activePlanId && !knownPlanIds.has(activePlanId)
    ? { id: activePlanId, name: planDisplayName(activePlanId) }
    : null

  const savePlanPreference = async (value: string): Promise<void> => {
    userEditedPlan.current = true
    setPlanSaveState('saving')
    try {
      if (value === '') {
        await clearPlanPreference()
        setPlanPreference('')
        setPlanSaveState('cleared')
      } else {
        await setPlanPreference(value)
        setPlanPreference(value)
        setPlanSaveState('saved')
      }
    } catch {
      setPlanSaveState('failed')
    }
  }

  const saveKey = async (): Promise<void> => {
    const value = keyDraft.trim()
    setKeyState((prev) => ({ phase: 'saving', configured: prev.phase === 'idle' ? prev.configured : false, writable: prev.phase === 'idle' ? prev.writable : false }))
    setTestResult(null)
    try {
      const status = await setCredential(value)
      setKeyDraft('')
      setKeyState({ phase: 'idle', configured: true, writable: status.writable, message: t('settings.keySaved') })
      refresh()
      monitor.refresh()
      requestMonitorRefresh()
    } catch (error) {
      setKeyState((prev) => ({
        phase: 'idle',
        configured: prev.phase === 'idle' ? prev.configured : false,
        writable: prev.phase === 'idle' ? prev.writable : false,
        message: t('settings.keySaveFailed'),
      }))
    }
  }

  const clearKey = async (): Promise<void> => {
    setKeyState((prev) => ({ phase: 'saving', configured: false, writable: prev.phase === 'idle' ? prev.writable : false }))
    setTestResult(null)
    try {
      const status = await clearCredential()
      setKeyDraft('')
      setKeyState({ phase: 'idle', configured: false, writable: status.writable, message: t('settings.keySaved') })
      refresh()
      monitor.refresh()
      requestMonitorRefresh()
    } catch {
      setKeyState((prev) => ({ phase: 'idle', configured: prev.phase === 'idle' ? prev.configured : false, writable: prev.phase === 'idle' ? prev.writable : false }))
    }
  }

  const testKey = async (): Promise<void> => {
    setKeyState((prev) => ({ phase: 'testing', configured: prev.phase === 'idle' ? prev.configured : false, writable: prev.phase === 'idle' ? prev.writable : false }))
    setTestResult(null)
    try {
      const result = await testCredential()
      setTestResult(result.ok ? t('settings.keyTestOk') : t('settings.keyTestFail'))
      // A successful test proves the key is live: refresh the usage dashboard
      // right away instead of waiting for the next 60s poll.
      if (result.ok) {
        refresh()
        monitor.refresh()
        requestMonitorRefresh()
      }
    } catch {
      setTestResult(t('settings.keyTestFail'))
    } finally {
      setKeyState((prev) => ({ phase: 'idle', configured: prev.phase === 'idle' ? prev.configured : false, writable: prev.phase === 'idle' ? prev.writable : false }))
    }
  }

  const saving = keyState.phase === 'saving'
  const testing = keyState.phase === 'testing'
  const configured = keyState.phase === 'idle' ? keyState.configured : false
  const writable = keyState.phase === 'idle' ? keyState.writable : false

  return (
    <div className={css.section}>
      <div>
        <div className={css.cardTitle}>{t('settings.title')}</div>
        <div className={css.cardHint}>{t('settings.description')}</div>
      </div>

      <div className={css.card}>
        <div className={css.cardTitle}>{t('settings.keyTitle')}</div>
        <div className={css.cardHint}>{t('settings.keyHint')}</div>
        <div className={css.keyRow}>
          <input
            className={css.input}
            type="password"
            value={keyDraft}
            placeholder={t('settings.keyPlaceholder')}
            onChange={(event) => setKeyDraft(event.target.value)}
            disabled={saving || testing || !writable}
          />
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={saving || testing || !writable || keyDraft.trim() === ''} onClick={() => void saveKey()}>
            {saving ? t('settings.keySetting') : t('settings.keySave')}
          </button>
          <button type="button" className={css.button} disabled={saving || testing} onClick={() => void clearKey()}>
            {t('settings.keyClear')}
          </button>
          <button type="button" className={css.button} disabled={testing || saving} onClick={() => void testKey()}>
            {testing ? t('settings.keyTesting') : t('settings.keyTest')}
          </button>
        </div>
        <div className={css.keyState}>
          {configured ? t('settings.keyConfigured') : t('settings.keyUnconfigured')}
          {keyState.phase === 'idle' && keyState.message ? ` · ${keyState.message}` : ''}
          {testResult ? ` · ${testResult}` : ''}
        </div>
      </div>

      <div className={css.card}>
        <div className={css.cardTitle}>{t('settings.widgetTitle')}</div>

        <div className={css.planBlock}>
          <div className={css.planHeader}>
            <label className={css.planLabel} htmlFor="commandcode-plan">{t('settings.planTitle')}</label>
            {planPreference && planPreference.length > 0 ? (
              <button
                type="button"
                className={css.planResetButton}
                disabled={planSaveState === 'saving'}
                onClick={() => { void savePlanPreference('') }}
              >
                {t('settings.planAuto')}
              </button>
            ) : null}
          </div>
          <div className={css.planHint}>{t('settings.planHint')}</div>
          <div className={css.planControls}>
            <select
              id="commandcode-plan"
              className={css.planSelect}
              value={activePlanId}
              onChange={(event) => { void savePlanPreference(event.target.value) }}
              disabled={planSaveState === 'saving'}
              aria-label={t('settings.planPlaceholder')}
            >
              <option value="">{t('settings.planAuto')}</option>
              {unknownActivePlan ? (
                <option value={unknownActivePlan.id}>{planLabel(unknownActivePlan)}</option>
              ) : null}
              {planOptions.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  title={`${option.name}${option.id !== option.name ? ` — ${option.id}` : ''}${option.monthlyCredits !== undefined ? ` · $${option.monthlyCredits}/mo credits` : ''}`}
                >
                  {planLabel(option)}
                </option>
              ))}
            </select>
            {planSaveState === 'saved' ? <span className={css.planState}>{t('settings.planSaved')}</span> : null}
            {planSaveState === 'cleared' ? <span className={css.planState}>{t('settings.planCleared')}</span> : null}
            {planSaveState === 'failed' ? <span className={css.planState}>{t('settings.planSaveFailed')}</span> : null}
            {planLoadState === 'error' ? <span className={css.planState} title={planLoadError ?? ''}>{t('settings.planLoadFailed')}</span> : null}
          </div>
          <div className={css.planSummary}>
            {activePlanId
              ? planSummaryLabel(activePlanId, planOptions)
              : t('settings.planAuto')}
          </div>
        </div>

        <div className={css.dashboard}>
          <UsageGauge
            used={monthUsed}
            cap={monthCap}
            monthly={credits?.monthlyCredits}
            purchased={credits?.purchasedCredits}
            free={credits?.freeCredits}
            t={t}
          />
          <div className={css.bars}>
            <WindowBar label={t('settings.window5h')} used={credits?.fiveHour.used} cap={window5hCap} color={barColor('fiveHour')} t={t} />
            <WindowBar label={t('settings.windowWeekly')} used={credits?.weekly.used} cap={weeklyCap} color={barColor('weekly')} t={t} />
            <WindowBar label={t('settings.windowMonthly')} used={monthUsed} cap={monthCap} color={barColor('monthly')} t={t} />
            {monitor.lastError ? <div className={css.statusLine}>{monitor.lastError}</div> : null}
            {turn.newTurn ? (
              <div className={css.statusLine}>
                {t('settings.turnCost')}: {turn.turn?.amount != null ? t('settings.turnAmount', { amount: Number(turn.turn.amount).toFixed(4) }) : t('settings.turnTokens', { tokens: compactNumber(turn.turn?.tokens) })}
              </div>
            ) : null}
          </div>
        </div>

        <div className={css.statsRow}>
          <div className={css.statCard}>
            <div className={css.statLabel}>{t('settings.totalRequests')}</div>
            <div className={css.statValue}>{compactNumber(usage?.totalCount)}</div>
          </div>
          <div className={css.statCard}>
            <div className={css.statLabel}>{t('settings.totalTokensIn')}</div>
            <div className={css.statValue}>{compactNumber(usage?.totalTokensIn)}</div>
          </div>
          <div className={css.statCard}>
            <div className={css.statLabel}>{t('settings.totalTokensOut')}</div>
            <div className={css.statValue}>{compactNumber(usage?.totalTokensOut)}</div>
          </div>
          <div className={css.statCard}>
            <div className={css.statLabel}>{t('settings.totalCost')}</div>
            <div className={css.statValue}>{money(usage?.totalCost)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
