import { isAgentKind, type TerminalId } from '@shared/terminal'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import type { PaneId, ProjectLayout } from '@renderer/features/workspace/layout'

/** Where a checkout's review comments go. */
export type Delivery =
  /** Typed into this running agent. */
  | { readonly kind: 'send'; readonly paneId: PaneId; readonly terminalId: TerminalId }
  /** The checkout's agent cannot take a prompt right now. */
  | { readonly kind: 'busy'; readonly paneId: PaneId; readonly reason: string }
  /** No agent is open on the checkout: offer to start one with the comments. */
  | { readonly kind: 'start' }

interface DeliveryInputs {
  readonly layout: ProjectLayout
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  readonly terminalIds: Readonly<Record<PaneId, TerminalId>>
  /** The checkout the comments are on: a worktree path, or null for the main checkout. */
  readonly worktreePath: string | null
}

const GONE: readonly PaneActivity[] = ['exited', 'error']

/**
 * The agent that owns a checkout: one running there (the focused one if several, else the
 * newest). An agent that is starting or waiting for an answer must not get keystrokes, since
 * Enter would answer its question.
 */
export function chooseDelivery({
  layout,
  activities,
  terminalIds,
  worktreePath,
}: DeliveryInputs): Delivery {
  const candidates = layout.panes.filter(
    (pane) =>
      isAgentKind(pane.kind) &&
      (pane.worktree?.path ?? null) === worktreePath &&
      !GONE.includes(activities[pane.id] ?? 'starting'),
  )
  const owner =
    candidates.find((pane) => pane.id === layout.focusedPaneId) ?? candidates.at(-1) ?? null
  if (!owner) return { kind: 'start' }
  const activity = activities[owner.id] ?? 'starting'
  const terminalId = terminalIds[owner.id]
  if (activity === 'needs-input') {
    return {
      kind: 'busy',
      paneId: owner.id,
      reason: 'The agent is waiting for you. Answer it first.',
    }
  }
  if (activity === 'starting' || !terminalId) {
    return { kind: 'busy', paneId: owner.id, reason: 'The agent is still starting.' }
  }
  return { kind: 'send', paneId: owner.id, terminalId }
}
