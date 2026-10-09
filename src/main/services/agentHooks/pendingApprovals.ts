import type { HookSignal } from '@shared/agentStatus'
import type { ToolCallPreview } from '@shared/toolCall'
import type { HookDetails } from './HookServer'
import type { ToolCallRef } from './toolCall'

/** A tool call the agent asked the user to approve and that has not finished yet. */
export interface PendingApproval {
  readonly toolCall: ToolCallRef
  readonly preview: ToolCallPreview
  /** The short line for the inbox and notifications, e.g. "Bash: npm install". */
  readonly detail: string | null
}

export const NO_APPROVALS: readonly PendingApproval[] = []

/** Signals that start or end a turn or session: nothing can still be waiting for approval. */
const CLEARS_ALL: ReadonlySet<HookSignal> = new Set(['ready', 'working', 'done'])

/** A pending approval is the one that just finished: same tool id, or same call when it has none. */
function isSameCall(pending: ToolCallRef, finished: ToolCallRef): boolean {
  if (pending.toolUseId !== null) return pending.toolUseId === finished.toolUseId
  return pending.key === finished.key
}

function withoutFinished(
  pending: readonly PendingApproval[],
  finished: ToolCallRef,
): readonly PendingApproval[] {
  const byId = pending.findIndex(
    (approval) =>
      approval.toolCall.toolUseId !== null && approval.toolCall.toolUseId === finished.toolUseId,
  )
  const index =
    byId !== -1 ? byId : pending.findIndex((approval) => isSameCall(approval.toolCall, finished))
  return index === -1 ? pending : pending.filter((_, i) => i !== index)
}

/**
 * Tracks which tool calls of one terminal still wait for approval, so a parallel tool finishing
 * does not hide "Needs you" (decision 036). Returns the same list when nothing changes.
 */
export function trackApprovals(
  pending: readonly PendingApproval[],
  signal: HookSignal,
  details: HookDetails,
): readonly PendingApproval[] {
  if (CLEARS_ALL.has(signal)) return pending.length === 0 ? pending : NO_APPROVALS
  const { toolCall, preview } = details
  if (signal === 'needs-input' && toolCall && preview)
    return [...pending, { toolCall, preview, detail: details.detail ?? null }]
  if (signal === 'tool-done' && toolCall) return withoutFinished(pending, toolCall)
  return pending
}
