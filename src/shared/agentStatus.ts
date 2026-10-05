export const AGENT_STATUSES = ['starting', 'idle', 'working', 'needs-input', 'done'] as const

/**
 * What a Claude Code session is doing, derived from its hooks.
 * `idle`: waiting for a prompt. `done`: finished a turn. `needs-input`: blocked on the user.
 */
export type AgentStatus = (typeof AGENT_STATUSES)[number]

/** Signals the hook commands send. Our own vocabulary, decoupled from hook event names. */
export const HOOK_SIGNALS = ['ready', 'working', 'needs-input', 'done'] as const

export type HookSignal = (typeof HOOK_SIGNALS)[number]
