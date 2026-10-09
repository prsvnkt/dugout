export type Env = Readonly<Record<string, string | undefined>>

export interface LaunchSpec {
  readonly file: string
  readonly args: readonly string[]
}

const FALLBACK_SHELL = '/bin/zsh'
const FALLBACK_LANG = 'en_US.UTF-8'
/**
 * Electron internals, Dugout's own per-terminal variables, plus markers a parent agent session sets (e.g. when the app is
 * launched from inside Claude Code). Leaking them makes a nested `claude` think it is a
 * child session. Legitimate user config is restored by the login shell's profile.
 */
const STRIPPED_ENV_PREFIXES = [
  'ELECTRON_',
  'CLAUDE_CODE_',
  'CLAUDE_PLUGIN_',
  'CODEX_COMPANION_',
  'DUGOUT_',
]
const STRIPPED_ENV_KEYS = new Set([
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'AI_AGENT',
  // Codex session internals (never CODEX_HOME or credentials).
  'CODEX_NON_INTERACTIVE',
  'CODEX_INTERNAL_ORIGINATOR_OVERRIDE',
  'CODEX_MCP_PROTOCOL_VERSION',
  // OpenCode marks its child processes; a nested opencode is not a child session.
  'OPENCODE',
  'OPENCODE_PID',
])

function isInheritable(key: string): boolean {
  return !STRIPPED_ENV_KEYS.has(key) && !STRIPPED_ENV_PREFIXES.some((p) => key.startsWith(p))
}

export function resolveShell(env: Env): string {
  const shell = env.SHELL
  return shell?.startsWith('/') ? shell : FALLBACK_SHELL
}

/**
 * Apps launched from Finder/Dock get a minimal PATH. Running an agent through an interactive
 * login shell loads the user's profile, so its CLI behaves exactly as in their terminal.
 * `agentCommandLine` comes from the agent's adapter; without one this is a plain shell.
 */
export function buildLaunchSpec(shell: string, agentCommandLine?: string): LaunchSpec {
  return agentCommandLine === undefined
    ? { file: shell, args: ['-l'] }
    : { file: shell, args: ['-l', '-i', '-c', agentCommandLine] }
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
