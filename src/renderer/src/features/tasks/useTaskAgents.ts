import { useMemo } from 'react'
import type { CompareSide } from '@shared/compare'
import type { ProjectId } from '@shared/project'
import { AGENT_LABEL, isAgentKind, type AgentKind } from '@shared/terminal'
import { mostUrgentCheck, type ActiveCheck } from '@renderer/features/checks/checks'
import { useCheckStore } from '@renderer/features/checks/checkStore'
import type { Pane } from '@renderer/features/workspace/layout'
import { projectAttention, type PaneActivity } from '@renderer/features/workspace/paneActivity'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

/** The agents working on one task: their kinds, and the most urgent of their statuses. */
export interface TaskAgents {
  readonly kinds: readonly AgentKind[]
  readonly activity: PaneActivity | null
  /** Agents in their own worktrees, which Compare can set side by side. */
  readonly compareSides: readonly CompareSide[]
  /** Verify on Stop for its agents: a failure first, else a running check, else a pass. */
  readonly check: ActiveCheck | null
}

/** Every task with an agent on it, by task number. */
export function useTaskAgents(projectId: ProjectId): ReadonlyMap<number, TaskAgents> {
  const panes = useWorkspaceStore((state) => state.layouts[projectId]?.panes)
  const activities = useWorkspaceStore((state) => state.activities)
  const terminalIds = useWorkspaceStore((state) => state.terminalIds)
  const checks = useCheckStore((state) => state.byTerminal)
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
            ? [
                {
                  label: AGENT_LABEL[pane.kind],
                  worktreePath: pane.worktree.path,
                  agent: pane.kind,
                },
              ]
            : [],
        )
        const activity = projectAttention(states) ?? states[0] ?? null
        const check = mostUrgentCheck(
          list.flatMap((pane) => {
            const terminalId = terminalIds[pane.id]
            const status = terminalId ? checks[terminalId] : undefined
            return status ? [status] : []
          }),
        )
        return [number, { kinds, activity, compareSides, check }]
      }),
    )
  }, [panes, activities, terminalIds, checks])
}
