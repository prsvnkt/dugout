import { useMemo } from 'react'
import type { ProjectId } from '@shared/project'
import { useProjectWorktrees } from '@renderer/features/worktrees/worktreeStore'
import { useProjectLayout } from '@renderer/features/workspace/workspaceStore'
import { useWorktreeChanges } from './overlapStore'
import {
  changedElsewhere,
  findOverlaps,
  labelOverlaps,
  type LabelledOverlap,
  type Overlap,
} from './overlaps'
import { liveWorktreePaths, trackWorktrees, worktreeLabel } from './trackedWorktrees'

const NONE: readonly LabelledOverlap[] = []

export interface ProjectOverlaps {
  /** Other agents that changed files this worktree changed too. */
  forWorktree(worktreePath: string | undefined): readonly LabelledOverlap[]
  /** Other agents that changed files this task's worktrees changed too. */
  forTask(taskNumber: number): readonly LabelledOverlap[]
  /** For Compare: per file, the other agents (beyond the compared `sides`) that changed it too. */
  elsewhere(sides: readonly string[]): ReadonlyMap<string, readonly string[]>
}

/** The project's live worktree paths, as a stable key for effects ("\n"-joined). */
export function useLiveWorktreeKey(projectId: ProjectId): string {
  const worktrees = useProjectWorktrees(projectId)
  const { panes } = useProjectLayout(projectId)
  return useMemo(() => liveWorktreePaths(worktrees, panes).join('\n'), [worktrees, panes])
}

/** Overlapping changes between the project's live worktrees, named for the screen. */
export function useProjectOverlaps(projectId: ProjectId): ProjectOverlaps {
  const changes = useWorktreeChanges(projectId)
  const worktrees = useProjectWorktrees(projectId)
  const { panes } = useProjectLayout(projectId)

  return useMemo(() => {
    const tracked = trackWorktrees(changes, panes)
    const overlaps = findOverlaps(tracked)
    const labelOf = (path: string) => worktreeLabel(path, panes, worktrees)
    const label = (raw: readonly Overlap[]) => (raw.length ? labelOverlaps(raw, labelOf) : NONE)
    const taskWorktrees = (taskNumber: number) =>
      new Set(
        panes.flatMap((pane) =>
          pane.task?.number === taskNumber && pane.worktree ? [pane.worktree.path] : [],
        ),
      )
    return {
      forWorktree: (path) => label((path && overlaps.get(path)) || []),
      forTask: (taskNumber) =>
        label([...taskWorktrees(taskNumber)].flatMap((path) => overlaps.get(path) ?? [])),
      elsewhere: (sides) => {
        const byFile = changedElsewhere(tracked, sides)
        return new Map(
          [...byFile].map(([file, paths]) => [file, [...new Set(paths.map(labelOf))]] as const),
        )
      },
    }
  }, [changes, panes, worktrees])
}
