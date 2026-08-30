/**
 * CMDAI monitoring surface, browser half.
 *
 * Registers:
 *  - `sidebar.footer.action` → the compact usage widget above Settings
 *  - `settings.section` → the first-level “CMDAI 监控” page
 *
 * All data comes from the plugin's same-origin Host routes; the browser never
 * sees the Command Code API key. The locale namespace `commandcode-usage` is
 * owned by this half.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings-surface Context merge and slot types.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the sidebar SlotMap merge (sidebar.footer.action).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the slot-surface SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { MonitorMiniWidget } from './MonitorMiniWidget.tsx'
import { MonitorSettingsPage, type MonitorSettingsPageInjected } from './MonitorSettingsPage.tsx'
import { en, zh, type CommandCodeUsageKey } from './locales.ts'

export { MonitorMiniWidget } from './MonitorMiniWidget.tsx'
export type { MonitorMiniWidgetProps } from './MonitorMiniWidget.tsx'
export { MonitorSettingsPage } from './MonitorSettingsPage.tsx'
export type { MonitorSettingsPageInjected, MonitorSettingsPageProps } from './MonitorSettingsPage.tsx'
export { en, zh } from './locales.ts'
export type { CommandCodeUsageKey } from './locales.ts'

/** Locale namespace owned by this plugin. */
const NS = 'commandcode-usage'

/** Settings namespace registered by the Host half. */
const UI_SETTINGS_NS = 'commandcode-usage-ui'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** CMDAI monitoring surface copy. */
    'commandcode-usage': CommandCodeUsageKey
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional rc.6 compatibility binder provided by dsh-web-ui-settings;
     * when absent, callers fall back to the official settings scope.
     */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

/** Required services. */
export const inject = ['slots', 'locale', 'connection', 'settingsScope', 'remote']

/** Settings value the monitor UI page can persist (browser-side prefs). */
export interface MonitorUiSettings {
  showWidget?: boolean
  notifyTurnCost?: boolean
  pollIntervalMs?: number
  turnCostCloseMs?: number
}

/**
 * Register the official DSH surfaces: the sidebar footer widget and the
 * first-level settings section.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'commandcode-usage: dictionaries')

  // The optional rc.6 compatibility binder provides a scope with load();
  // the official scope does not, so narrow only when calling load below.
  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const monitorScope = binder.bind<MonitorUiSettings>({ namespace: UI_SETTINGS_NS })
  const refreshLoaded = (): void => {
    const maybeLoad = monitorScope as unknown as { load?: () => void } | undefined
    maybeLoad?.load?.()
  }

  // First-level settings page: CMDAI 监控.
  ctx.slots.inject('settings.section', () => {
    const unregister = ctx.slots.register({
      name: 'settings.section',
      id: 'commandcode-usage-monitor',
      order: 135,
      label: () => ctx.locale.bind(NS)('settings.title'),
      locale: NS,
      inject: (): MonitorSettingsPageInjected => ({ refresh: refreshLoaded }),
    }, MonitorSettingsPage)
    return () => {
      unregister()
    }
  })

  // Sidebar footer widget above Settings.
  ctx.slots.inject('sidebar.footer.action', () => {
    const unregister = ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'commandcode-usage-monitor',
      order: 100,
      locale: NS,
      inject: () => ({}),
    }, MonitorMiniWidget)
    return () => {
      unregister()
    }
  })
}
