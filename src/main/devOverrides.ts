import type { AgentKind } from '@shared/agents'
import { AGENT_ADAPTERS } from './services/agents/registry'

type Env = Readonly<Record<string, string | undefined>>

/**
 * Environment overrides for e2e tests and development (decision 060). Every one of them is read
 * here and nowhere else, so a new override cannot skip the gate.
 */
export interface DevOverrides {
  /** DUGOUT_USER_DATA_DIR: an isolated app data folder. */
  readonly userDataDir?: string
  /** DUGOUT_HOME_DIR: the folder the welcome screen searches instead of the real home. */
  readonly homeDir?: string
  /** DUGOUT_OPEN_COMMAND: a stand-in for macOS `open`. */
  readonly openCommand?: string
  /** DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS=1: plaintext token files instead of Keychain. */
  readonly insecureTokenStorage: boolean
  /** DUGOUT_GITHUB_BASE_URL: one server for GitHub web and API (no trailing slash). */
  readonly githubBaseUrl?: string
  /** DUGOUT_GITHUB_CLIENT_ID: another OAuth app; "" means not configured. */
  readonly githubClientId?: string
  /** DUGOUT_LINEAR_BASE_URL: one server for Linear's API and issue pages. */
  readonly linearBaseUrl?: string
  /** DUGOUT_<AGENT>_COMMAND: the command each agent runs instead of its default. */
  readonly agentCommands: Readonly<Partial<Record<AgentKind, string>>>
  /** ELECTRON_RENDERER_URL: electron-vite's dev server. Never honoured when packaged. */
  readonly rendererUrl?: string
  /** Names of the variables honoured, sorted. */
  readonly active: readonly string[]
  /** Names of the variables set but ignored (gated or invalid), sorted. */
  readonly rejected: readonly string[]
}

export interface OverrideOptions {
  readonly isPackaged: boolean
}

const E2E_FLAG = 'DUGOUT_E2E'
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost'])

/** `https://…`, or `http://` on the loopback interface; no credentials. Else undefined. */
function safeBaseUrl(value: string): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.username !== '' || url.password !== '') return undefined
  const isLoopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !isLoopbackHttp) return undefined
  return value.replace(/\/$/, '')
}

const identity = (value: string): string | undefined => value

/**
 * Reads every override from `env`. A packaged app ignores them all unless DUGOUT_E2E=1 (the
 * packaged e2e run), and even then never loads a renderer URL. Base URLs are validated always.
 */
export function readOverrides(env: Env, { isPackaged }: OverrideOptions): DevOverrides {
  const isGated = isPackaged && env[E2E_FLAG] !== '1'
  const active: string[] = []
  const rejected: string[] = []

  /** The variable's value if it is set and allowed; `parse` may reject it. */
  const take = (name: string, parse = identity, allowEmpty = false): string | undefined => {
    const raw = env[name]
    if (raw === undefined || (raw === '' && !allowEmpty)) return undefined
    const value = isGated ? undefined : parse(raw)
    ;(value === undefined ? rejected : active).push(name)
    return value
  }

  const agentCommands = Object.fromEntries(
    Object.values(AGENT_ADAPTERS).flatMap((adapter) => {
      const command = take(adapter.commandVariable)
      return command === undefined ? [] : [[adapter.info.kind, command]]
    }),
  ) as Partial<Record<AgentKind, string>>

  const fields = {
    userDataDir: take('DUGOUT_USER_DATA_DIR'),
    homeDir: take('DUGOUT_HOME_DIR'),
    openCommand: take('DUGOUT_OPEN_COMMAND'),
    githubBaseUrl: take('DUGOUT_GITHUB_BASE_URL', safeBaseUrl),
    githubClientId: take('DUGOUT_GITHUB_CLIENT_ID', identity, true),
    linearBaseUrl: take('DUGOUT_LINEAR_BASE_URL', safeBaseUrl),
    rendererUrl: take('ELECTRON_RENDERER_URL', (value) => (isPackaged ? undefined : value)),
  }
  const insecureTokenStorage =
    take('DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS', (v) => (v === '1' ? v : undefined)) === '1'
  const defined = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as { [K in keyof typeof fields]?: NonNullable<(typeof fields)[K]> }

  return Object.freeze({
    ...defined,
    insecureTokenStorage,
    agentCommands: Object.freeze(agentCommands),
    active: Object.freeze(active.sort()),
    rejected: Object.freeze(rejected.sort()),
  })
}

/** One line naming the overrides in effect (and any ignored), or undefined when there are none. */
export function describeOverrides(overrides: DevOverrides): string | undefined {
  const parts = [
    overrides.active.length > 0 ? `active: ${overrides.active.join(', ')}` : '',
    overrides.rejected.length > 0 ? `ignored: ${overrides.rejected.join(', ')}` : '',
  ].filter((part) => part !== '')
  if (parts.length === 0) return undefined
  return `[dugout] dev/test environment overrides ${parts.join('; ')} (decision 060)`
}
