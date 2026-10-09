import { useMemo } from 'react'
import type { CompareSide } from '@shared/compare'
import type { ProjectId } from '@shared/project'
import { AGENT_LABEL, isAgentKind, type AgentKind } from '@shared/terminal'
import type { Pane } from '@renderer/features/workspace/layout'
import { projectAttention, type PaneActivity } from '@renderer/features/workspace/paneActivity'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

/** The agents working on one task: their kinds, and the most urgent of their statuses. */
export interface TaskAgents {
  readonly kinds: readonly AgentKind[]
  readonly activity: PaneActivity | null
  /** Agents in their own worktrees, which Compare can set side by side. */
  readonly compareSides: readonly CompareSide[]
}

/** Every task with an agent on it, by task number. */
export function useTaskAgents(projectId: ProjectId): ReadonlyMap<number, TaskAgents> {
  const panes = useWorkspaceStore((state) => state.layouts[projectId]?.panes)
  const activities = useWorkspaceStore((state) => state.activities)
  return useMemo(() => {
    const byTask = new Map<number, Pane[]>()
    for (const pane of panes ?? []) {
      if (!pane.task) continue
      byTask.set(pane.task.number, [...(byTask.get(pane.task.number) ?? []), pane])
    }
    return new Map(
      [...byTask].map(([number, list]) => {
        const states = list.flatMap((pane) => {
          const activity = activities[pane.id]
          return activity ? [activity] : []
        })
        const kinds = [...new Set(list.map((pane) => pane.kind).filter(isAgentKind))]
        const compareSides = list.flatMap((pane) =>
          pane.worktree && isAgentKind(pane.kind)
            ? [{ label: AGENT_LABEL[pane.kind], worktreePath: pane.worktree.path }]
            : [],
        )
        const activity = projectAttention(states) ?? states[0] ?? null
        return [number, { kinds, activity, compareSides }]
      }),
    )
  }, [panes, activities])
}
