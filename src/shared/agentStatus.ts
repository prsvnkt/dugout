export const AGENT_STATUSES = ['starting', 'idle', 'working', 'needs-input', 'done'] as const

/**
 * What an agent session is doing, from its hooks or plugin (decision 008).
 * `idle`: waiting for a prompt. `done`: finished a turn. `needs-input`: blocked on the user.
 */
export type AgentStatus = (typeof AGENT_STATUSES)[number]

/**
 * Signals the hook commands send. Our own vocabulary, decoupled from hook event names.
 * `working` starts a turn (a prompt); `tool-done` is one tool call finishing within it.
 */
export const HOOK_SIGNALS = ['ready', 'working', 'tool-done', 'needs-input', 'done'] as const

export type HookSignal = (typeof HOOK_SIGNALS)[number]

/** Signals for subagents an agent starts; they never change the agent's own status. */
export const SUBAGENT_SIGNALS = ['subagent-start', 'subagent-stop'] as const

export type SubagentSignal = (typeof SUBAGENT_SIGNALS)[number]

/** A subagent starting (`running`) or finishing (`done`), from its parent's hooks. */
export interface SubagentUpdate {
  /** The CLI's id for the subagent, unique within the parent session. */
  readonly id: string
  /** Its kind, e.g. "Explore" or "code-reviewer". */
  readonly type: string
  readonly state: 'running' | 'done'
  /** First line of its last reply, once it has finished. */
  readonly detail?: string
}
