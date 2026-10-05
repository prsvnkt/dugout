import type { TerminalKind } from '@shared/terminal'

export type Env = Readonly<Record<string, string | undefined>>

export interface LaunchSpec {
  readonly file: string
  readonly args: readonly string[]
}

const FALLBACK_SHELL = '/bin/zsh'
const FALLBACK_LANG = 'en_US.UTF-8'
/**
 * Electron internals, plus markers a parent agent session sets (e.g. when the app is
 * launched from inside Claude Code). Leaking them makes a nested `claude` think it is a
 * child session. Legitimate user config is restored by the login shell's profile.
 */
const STRIPPED_ENV_PREFIXES = ['ELECTRON_', 'CLAUDE_CODE_', 'CLAUDE_PLUGIN_', 'CODEX_COMPANION_']
const STRIPPED_ENV_KEYS = new Set(['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'AI_AGENT'])

function isInheritable(key: string): boolean {
  return !STRIPPED_ENV_KEYS.has(key) && !STRIPPED_ENV_PREFIXES.some((p) => key.startsWith(p))
}

export function resolveShell(env: Env): string {
  const shell = env.SHELL
  return shell?.startsWith('/') ? shell : FALLBACK_SHELL
}

/**
 * Apps launched from Finder/Dock get a minimal PATH. Running through an interactive
 * login shell loads the user's profile, so `claude` behaves exactly as in their terminal.
 */
export function buildLaunchSpec(kind: TerminalKind, shell: string): LaunchSpec {
  switch (kind) {
    case 'claude':
      return { file: shell, args: ['-l', '-i', '-c', 'claude'] }
    case 'shell':
      return { file: shell, args: ['-l'] }
  }
}

export function buildTerminalEnv(env: Env): Record<string, string> {
  const inherited = Object.entries(env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && isInheritable(entry[0]),
  )

  return {
    LANG: FALLBACK_LANG,
    ...Object.fromEntries(inherited),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    TERM_PROGRAM: 'Dugout',
  }
}
