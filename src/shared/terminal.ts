export const TERMINAL_KINDS = ['claude', 'codex', 'shell'] as const

/** `claude` / `codex` run those agent CLIs; `shell` is a plain login shell. */
export type TerminalKind = (typeof TERMINAL_KINDS)[number]

export const AGENT_KINDS = ['claude', 'codex'] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

/** Agents get status hooks, task tools, resume and the inbox; shells do not. */
export function isAgentKind(kind: TerminalKind): kind is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(kind)
}

export const AGENT_LABEL: Readonly<Record<AgentKind, string>> = { claude: 'Claude', codex: 'Codex' }

export type TerminalId = string

export interface TerminalExit {
  readonly exitCode: number
  readonly signal?: number
}
