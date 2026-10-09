import type { AgentKind } from './agents'

/** How a tool call or subagent ended; `pending` when the transcript has no result for it yet. */
export type TimelineOutcome = 'ok' | 'failed' | 'pending'

/**
 * One step of an agent session, read from its transcript (decision 048): what the user asked,
 * what the agent said between steps, and the tools and subagents it ran, in order.
 */
export type TimelineEvent =
  | { readonly kind: 'prompt'; readonly at: string; readonly text: string }
  | { readonly kind: 'message'; readonly at: string; readonly text: string }
  | {
      readonly kind: 'tool'
      readonly at: string
      readonly id: string
      readonly name: string
      /** The call's main argument (a command, a file, a pattern), shortened; null if none. */
      readonly detail: string | null
      readonly outcome: TimelineOutcome
    }
  | {
      readonly kind: 'subagent'
      readonly at: string
      readonly id: string
      readonly agentType: string | null
      readonly detail: string | null
      readonly outcome: TimelineOutcome
    }

/** A file the session edited (written, patched) or only read, relative to its folder if inside. */
export interface TouchedFile {
  readonly path: string
  readonly change: 'edited' | 'read'
}

export interface SessionTimeline {
  readonly agent: AgentKind
  readonly sessionId: string
  readonly events: readonly TimelineEvent[]
  readonly files: readonly TouchedFile[]
  /** The agent's last message to the user. */
  readonly finalMessage: string | null
  /** ISO timestamps of the first and last steps read; null when there were none. */
  readonly startedAt: string | null
  readonly endedAt: string | null
  /** Older steps (or files) were left out to keep the timeline small. */
  readonly isTruncated: boolean
}
