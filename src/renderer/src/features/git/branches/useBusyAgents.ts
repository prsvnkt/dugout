import { isAgentKind } from '@shared/terminal'
import type { GitCheckout } from '@shared/worktree'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'

/** An agent in one of these states would have files change under it mid-task. */
const BUSY: ReadonlySet<PaneActivity> = new Set(['starting', 'working', 'needs-input'])

/** How many agents are busy in this checkout (main or a worktree). */
export function useBusyAgents(checkout: GitCheckout): number {
  return useWorkspaceStore((state) => {
    const panes = state.layouts[checkout.projectId]?.panes ?? []
    return panes.filter(
      (pane) =>
        isAgentKind(pane.kind) &&
        (pane.worktree?.path ?? null) === (checkout.worktreePath ?? null) &&
        BUSY.has(state.activities[pane.id] ?? 'idle'),
    ).length
  })
}
