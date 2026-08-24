/**
 * Compact CMDAI usage widget for the sidebar footer action seat.
 *
 * Registers into `sidebar.footer.action`, which the sidebar shell places
 * directly above the Settings trigger. It polls the Host status endpoint,
 * shows multi-color usage bars, and can expand to open the settings page.
 */

import { useEffect, useRef } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { monthlyUsedCredits, planFiveHourCap, planMonthlyCap, planWeeklyCap } from '../plan.ts'
import { primaryAccount, ratio, useMonitorStatus, money, compactNumber } from './use-monitor.ts'
import css from './monitor.module.css'

/** Props the sidebar footer seat supplies (wide only) + the locale seat. */
export type MonitorMiniWidgetProps = PropsLocale<'commandcode-usage'> & { wide: boolean }

function WindowBar({
  label,
  used,
  cap,
  color,
}: {
  label: string
  used: number | null | undefined
  cap: number | null | undefined
  color: string
}) {
  const r = ratio(used, cap)
  const pct = Math.round(r * 100)
  return (
    <div className={css.miniRow}>
      {/* Fixed-width label frame: every row's bar starts at the same X. */}
      <div className={css.miniLabelFrame}>
        <span>{label}</span>
      </div>
      {/* Bar frame: bar + right-aligned value share one flex column. */}
      <div className={css.miniBarFrame}>
        <div className={css.miniBar}>
          <div className={css.miniFill} style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className={css.miniValue} title={`${Number(used).toFixed(2)} / ${Number(cap).toFixed(0)}`}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

/** The sidebar footer widget. */
export function MonitorMiniWidget({ wide, t }: MonitorMiniWidgetProps) {
  const monitor = useMonitorStatus(60_000)
  const account = primaryAccount(monitor.snapshot)
  const report = account?.report
  const credits = report?.credits
  const usage = report?.usage
  const plan = report?.plan
  const rootRef = useRef<HTMLDivElement>(null)
  const visible = wide

  const monthCap = planMonthlyCap(plan?.planId)
    ?? (usage?.totalCost ?? 0) + (credits?.monthlyCredits ?? 0)
  const monthUsed = monthlyUsedCredits(plan?.planId, credits?.monthlyCredits)
    ?? (usage?.totalCost ?? 0)
  const window5hCap = planFiveHourCap(plan?.planId) ?? credits?.fiveHour.cap ?? 0
  const weeklyCap = planWeeklyCap(plan?.planId) ?? credits?.weekly.cap ?? 0

  // The sidebar's `footerActions` seat is a horizontal flex row shared with
  // other footer actions (e.g. “检查更新”). When visible, stack the row
  // vertically and put this widget first, so it occupies its own row directly
  // above the normal footer action controls and the Settings trigger.
  useEffect(() => {
    if (!visible) return
    const el = rootRef.current
    if (!el) return
    // The slot renderer wraps every entry in an invisible `data-slot` anchor
    // (`display: contents`). The real sidebar footer row is that anchor's
    // parent (`*.footerActions`). Styling the anchor itself turns it into a
    // regular flex item whose width is content-sized and never fills the
    // sidebar, so we must target the actual footer row here.
    const anchor = el.parentElement
    const parent = anchor?.parentElement ?? el.parentElement
    if (!parent) return
    const prevDisplay = parent.style.display
    const prevDirection = parent.style.flexDirection
    const prevAlign = parent.style.alignItems
    const prevWrap = parent.style.flexWrap
    parent.style.display = 'flex'
    parent.style.flexDirection = 'column'
    parent.style.alignItems = 'stretch'
    parent.style.flexWrap = 'nowrap'
    el.style.order = '-1'
    el.style.width = '100%'
    return () => {
      parent.style.display = prevDisplay
      parent.style.flexDirection = prevDirection
      parent.style.alignItems = prevAlign
      parent.style.flexWrap = prevWrap
      el.style.order = ''
      el.style.width = ''
    }
  }, [visible])

  if (!visible) {
    // In the collapsed 56px rail the sidebar shell only wants a compact icon;
    // the registration supplies no icon, so return null and let the footer
    // seat remain icon-less when collapsed (avoid a broken empty box).
    return null
  }

  const liveLabel = monitor.refreshing ? t('settings.widgetUpdating') : t('settings.widgetLive')

  const barColors = {
    fiveHour: 'var(--cmda-monitor-blue)',
    weekly: 'var(--cmda-monitor-warn)',
    monthly: 'var(--cmda-monitor-success)',
  }

  return (
    <div ref={rootRef} className={css.root} data-plugins="commandcode-usage-mini">
      <div className={css.miniCard}>
        <div className={css.miniHeader}>
          <span className={css.miniTitle}>◉ {t('settings.widgetTitle')}</span>
          <span className={css.miniLive} data-state={monitor.refreshing ? 'updating' : 'live'}>{liveLabel}</span>
        </div>

        <WindowBar label={t('settings.window5h')} used={credits?.fiveHour.used} cap={window5hCap} color={barColors.fiveHour} />
        <WindowBar label={t('settings.windowWeekly')} used={credits?.weekly.used} cap={weeklyCap} color={barColors.weekly} />
        <WindowBar label={t('settings.windowMonthly')} used={monthUsed} cap={monthCap} color={barColors.monthly} />

        <div className={css.miniStats}>
          <div className={css.miniStat}>
            <span className={css.miniStatLabel}>{t('settings.tokensInOut')}</span>
            <span className={css.miniStatValue}>
              {compactNumber(usage?.totalTokensIn)} / {compactNumber(usage?.totalTokensOut)}
            </span>
          </div>
          <div className={css.miniStat}>
            <span className={css.miniStatLabel}>{t('settings.requestsCost')}</span>
            <span className={css.miniStatValue}>
              {compactNumber(usage?.totalCount)} / {money(usage?.totalCost)}
            </span>
          </div>
        </div>

        <div className={css.colorStrip}>
          <span className={css.stripInput} title={t('settings.legendInput')} />
          <span className={css.stripCache} title={t('settings.legendCache')} />
          <span className={css.stripOutput} title={t('settings.legendOutput')} />
          <span className={css.stripReasoning} title={t('settings.legendReasoning')} />
        </div>
      </div>
    </div>
  )
}
