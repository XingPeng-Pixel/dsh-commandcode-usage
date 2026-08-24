/**
 * `/commandcode-usage` slash command — on-demand usage dashboard.
 *
 * Backed by the live UsageStore, so it does not trigger an extra API call
 * unless the store is empty/stale (then it runs a manual refresh).
 */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import type { UsageStore } from './store.ts'
import type { CommandCodeUsageReport } from './types.ts'

function money(value: number): string {
  return `$${value.toFixed(4)}`
}

function moneyShort(value: number): string {
  return `$${value.toFixed(2)}`
}

function tokensCompact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

function resetLabel(ms: number): string {
  if (ms <= 0) return 'n/a'
  return new Date(ms).toLocaleString()
}

function bar(used: number, cap: number): string {
  if (cap <= 0) return '—'
  const ratio = Math.max(0, Math.min(1, used / cap))
  const filled = Math.round(ratio * 10)
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function renderReport(report: CommandCodeUsageReport, title?: string): string {
  const lines: string[] = []
  const account = report.account ? ` (${report.account.userName || report.account.name})` : ''
  lines.push(title ?? `📊 Command Code 用量${account}`, '')

  if (report.blocked === 'invalid-key') {
    lines.push('⛔ API 密钥无效或已过期 — 服务端拒绝了全部请求（401），请检查该账户的密钥配置', '')
  } else if (report.blocked === 'service-unavailable') {
    lines.push('⚠️ Command Code 服务暂时不可用（5xx），稍后重试', '')
  } else if (report.blocked === 'network') {
    lines.push('⚠️ 无法连接 Command Code 服务 — 请检查网络或 API 地址', '')
  }

  if (report.plan && report.plan.name !== '') {
    const p = report.plan
    const status = p.status !== '' && p.status !== 'active' ? ` (${p.status})` : ''
    const period = p.currentPeriodEnd > 0 ? ` · 账期截止 ${new Date(p.currentPeriodEnd).toLocaleDateString()}` : ''
    lines.push(`  📦 套餐    ${p.name}${status}${period}`, '')
  }

  if (report.usage) {
    const u = report.usage
    lines.push(
      '── 请求 ──────────────────────────────',
      `  💬 请求    ${u.completedCount} 次 / 失败 ${u.failedCount}  成功率 ${u.successRate}%`,
      `  💰 花费    ${money(u.totalCost)}  (${moneyShort(u.totalCredits)} credits)`,
      `  🔤 Token   ${tokensCompact(u.totalTokensIn)} 入 / ${tokensCompact(u.totalTokensOut)} 出`,
      '',
    )
  }

  if (report.credits) {
    const c = report.credits
    lines.push(
      '── 信用 ──────────────────────────────',
      `  💳 月额度  ${moneyShort(c.monthlyCredits)}   (已购 ${moneyShort(c.purchasedCredits)} / 赠送 ${moneyShort(c.freeCredits)})`,
      '',
      '── 窗口用量 ──────────────────────────',
      `  ⏱ 5 小时  ${moneyShort(c.fiveHour.used)} / ${moneyShort(c.fiveHour.cap)}${c.fiveHour.exceeded ? '  ⚠️ 超限!' : ''}`,
      `     └ ${bar(c.fiveHour.used, c.fiveHour.cap)}  重置 ${resetLabel(c.fiveHour.resetAt)}`,
      `  📅 每周    ${moneyShort(c.weekly.used)} / ${moneyShort(c.weekly.cap)}${c.weekly.exceeded ? '  ⚠️ 超限!' : ''}`,
      `     └ ${bar(c.weekly.used, c.weekly.cap)}  重置 ${resetLabel(c.weekly.resetAt)}`,
      '',
    )
  }

  if (report.failures.length > 0) {
    lines.push(`⚠️  部分端点失败: ${report.failures.join('; ')}`, '')
  }
  if (!report.account && !report.usage && !report.credits) {
    lines.push('(no data — check your API key)', '')
  }
  return lines.join('\n').trimEnd()
}

export interface UsageCommandDeps {
  store: UsageStore
  /** Manual refresh trigger (optional). */
  refresh?: () => Promise<void>
}

export function commandDefinition(deps: UsageCommandDeps): CommandDefinition {
  return {
    name: 'commandcode-usage',
    description: 'Command Code usage dashboard',
    input: { hint: '[status]' },
    handler: async () => {
      const snapshot = deps.store.getSnapshot()
      if (snapshot.accounts.length === 0 && deps.refresh) {
        await deps.refresh()
      }
      const current = deps.store.getSnapshot()
      if (current.accounts.length === 0) {
        return { kind: 'error', text: 'No Command Code accounts configured.' }
      }
      const sections = current.accounts.map((entry) => {
        const badges = `${entry.active ? '  ✅ 当前使用' : ''}${entry.mark === 'invalid-credential' ? '  ⛔ 密钥无效' : ''}${entry.mark === 'rate-limit' ? '  ⏳ 限额冷却中' : ''}`
        const title = `📊 ${entry.label}${badges}`
        if (!entry.configured) return `${title}\n\n  (未配置 API 密钥)`
        return renderReport(entry.report, title)
      })
      const stale = current.stale ? '\n\n⚠️ 数据可能不是最新（stale）' : ''
      return { kind: 'success', text: sections.join('\n\n────────────────────\n\n') + stale }
    },
  }
}

export function applyCommands(ctx: Context, deps: UsageCommandDeps): void {
  ctx.commands.register(commandDefinition(deps))
}
