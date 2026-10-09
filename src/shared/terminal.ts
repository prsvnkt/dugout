import { AGENT_KINDS, type AgentKind } from './agents'

export { AGENT_KINDS, AGENT_LABEL, type AgentKind } from './agents'

export const TERMINAL_KINDS = [...AGENT_KINDS, 'shell'] as const

/** An agent CLI (see `./agents`), or `shell`: a plain login shell. */
export type TerminalKind = (typeof TERMINAL_KINDS)[number]

/** Agents get status, task tools, resume and the inbox, as far as their capabilities go; shells do not. */
export function isAgentKind(kind: TerminalKind): kind is AgentKind {
  return (AGENT_KINDS as readonly string[]).includes(kind)
}

export type TerminalId = string

export interface TerminalExit {
  readonly exitCode: number
  readonly signal?: number
}
