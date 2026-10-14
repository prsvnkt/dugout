import { AGENT_KINDS, type AgentKind } from './agents'

export { AGENT_KINDS, AGENT_LABEL, type AgentKind } from './agents'

/** Every kind of terminal: one per agent CLI, plus `shell`. Saved in layouts. */
export const TERMINAL_KINDS = [...AGENT_KINDS, 'shell'] as const

/** An agent CLI (see `./agents`), or `shell`: a plain login shell. */
export type TerminalKind = (typeof TERMINAL_KINDS)[number]

/** Agents get status, task tools, resume and the inbox, as far as their capabilities go; shells do not. */
export function isAgentKind(kind: TerminalKind): kind is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(kind)
}

/** A terminal's id, made by main when it starts; its hook token and MCP config are keyed by it. */
export type TerminalId = string

/** How a terminal's process ended. */
export interface TerminalExit {
  readonly exitCode: number
  /** The signal that killed it, if any. */
  readonly signal?: number
}
