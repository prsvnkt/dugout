export const TERMINAL_KINDS = ['claude', 'shell'] as const

/** `claude` runs the Claude Code CLI; `shell` is a plain login shell. */
export type TerminalKind = (typeof TERMINAL_KINDS)[number]

export type TerminalId = string

export interface TerminalExit {
  readonly exitCode: number
  readonly signal?: number
}
