/**
 * API key resolution helpers for dsh-commandcode-usage-monitor.
 *
 * Resolution order (same spirit as dsh-commandcode-provider):
 *  1. literal config.apiKey (composition only)
 *  2. `ctx.credentials` service (when the profile provides it)
 *  3. launch environment (`COMMANDCODE_API_KEY` or a configured env name)
 *  4. official CLI auth file `~/.commandcode/auth.json`
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function apiKeyFromCredentialRecord(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const type = stringValue(value.type)
  if (type === 'api') return stringValue(value.key)
  if (type === 'oauth') return stringValue(value.access)
  return stringValue(value.key) ?? stringValue(value.access)
}

/** Read a usable Command Code credential from the official CLI auth file. */
export function resolveAuthFileApiKey(): string | undefined {
  const authPath = join(homedir(), '.commandcode', 'auth.json')
  try {
    if (!existsSync(authPath)) return undefined
    const parsed: unknown = JSON.parse(readFileSync(authPath, 'utf8'))
    if (!isRecord(parsed)) return undefined
    const direct = stringValue(parsed.apiKey) ?? stringValue(parsed.commandcode)
    if (direct) return direct
    const nested =
      apiKeyFromCredentialRecord(parsed.commandcode) ??
      apiKeyFromCredentialRecord(parsed['command-code'])
    return nested
  } catch {
    return undefined
  }
}

export interface ResolveApiKeyOptions {
  ctx: Context
  apiKeyEnv: string
  literalApiKey?: string
  accountApiKey?: string
  accountApiKeyEnv?: string
}

/**
 * Resolve one account's API key through the full fallback chain.
 * `literalApiKey` wins; then per-account literal/env; then top-level
 * credentials/env/auth file.
 */
export async function resolveApiKey(options: ResolveApiKeyOptions): Promise<string | undefined> {
  // 1. Per-account literal
  if (options.accountApiKey) return options.accountApiKey

  // 2. Per-account env / top-level env name via credentials service
  const envName = options.accountApiKeyEnv ?? options.apiKeyEnv
  const ref: CredentialRef = credentialRef(envName)

  const credentials = options.ctx.get('credentials')
  if (credentials) {
    try {
      const hit = await credentials.resolve(ref)
      if (hit?.value) return hit.value
    } catch {
      // fall through
    }
  }

  // 3. Launch environment (process.env / .env layers)
  const ambient = launchEnvironmentOf(options.ctx).get(envName)
  if (ambient?.value && ambient.value.length > 0) return ambient.value

  // 4. Top-level literal only when no per-account ref was used
  if (!options.accountApiKeyEnv) {
    if (options.literalApiKey) return options.literalApiKey
  }

  // 5. Official CLI auth file (only for default account, not per-account env)
  if (!options.accountApiKeyEnv) {
    return resolveAuthFileApiKey()
  }

  return undefined
}
