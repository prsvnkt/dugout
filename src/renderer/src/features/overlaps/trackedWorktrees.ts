import type { WorktreeChanges } from '@shared/compare'
import { displayTaskKey } from '@shared/tasks'
import { AGENT_LABEL, isAgentKind } from '@shared/terminal'
import type { Worktree } from '@shared/worktree'
import type { Pane, PaneTask } from '@renderer/features/workspace/layout'
import type { TrackedWorktree } from './overlaps'

/**
 * Every live worktree of a project: the ones on disk, plus any an open agent runs in that the
 * list has not caught up with yet. Sorted by path, so the list is stable between refreshes.
 */
export function liveWorktreePaths(
  worktrees: readonly Worktree[],
  panes: readonly Pane[],
): string[] {
  const paths = [
    ...worktrees.map((worktree) => worktree.path),
    ...panes.flatMap((pane) => (pane.worktree ? [pane.worktree.path] : [])),
  ]
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b))
}

/** The task the agents in this worktree were started for, if any. */
function taskOf(worktreePath: string, panes: readonly Pane[]): PaneTask | undefined {
  return panes.find((pane) => pane.worktree?.path === worktreePath && pane.task)?.task
}

/** Changed files per worktree, with the task each worktree's agents work on. */
export function trackWorktrees(
  changes: readonly WorktreeChanges[],
  panes: readonly Pane[],
): TrackedWorktree[] {
  return changes.map(({ worktreePath, changes: files }) => ({
    worktreePath,
    files: files.map((file) => file.path),
    taskNumber: taskOf(worktreePath, panes)?.number,
  }))
}

/**
 * How a worktree is named on screen: its agent's task ("#12"), else its agent and worktree name
 * ("Codex (k3x9)"), else the worktree name.
 */
export function worktreeLabel(
  worktreePath: string,
  panes: readonly Pane[],
  worktrees: readonly Worktree[],
): string {
  const task = taskOf(worktreePath, panes)
  if (task !== undefined) return displayTaskKey(task)
  const agent = panes.find((pane) => pane.worktree?.path === worktreePath && isAgentKind(pane.kind))
  const name =
    agent?.worktree?.name ??
    worktrees.find((worktree) => worktree.path === worktreePath)?.name ??
    worktreePath.split('/').pop() ??
    worktreePath
  return agent && isAgentKind(agent.kind) ? `${AGENT_LABEL[agent.kind]} (${name})` : name
}
