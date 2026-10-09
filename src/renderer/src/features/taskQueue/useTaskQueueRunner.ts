import { useEffect, useMemo } from 'react'
import type { Project, ProjectId } from '@shared/project'
import { maxAgentsOf, type QueuedTask } from '@shared/taskQueue'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { useTaskStore } from '@renderer/features/tasks/taskStore'
import type { Pane } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { busySlots, slotAgentsOf, tasksToStart } from './slots'
import { useProjectLaunches, useTaskQueueStore } from './taskQueueStore'

const NO_PANES: readonly Pane[] = []

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Starts a queued task through the same path as "Start agent" (worktree, setup, first prompt),
 * after taking it off the queue. A failure is shown in the Tasks panel's queue.
 */
function startQueued(projectId: ProjectId, task: QueuedTask): void {
  const { setError } = useTaskQueueStore.getState()
  setError(projectId, null)
  useTaskStore
    .getState()
    .startAgent(projectId, task.number, [task.agent])
    .catch((error: unknown) =>
      setError(projectId, `Could not start ${task.key}: ${messageOf(error)}`),
    )
  useProjectsStore
    .getState()
    .changeTaskQueue(projectId, { kind: 'remove', number: task.number })
    .catch((error: unknown) => setError(projectId, messageOf(error)))
}

function runProjectQueue(project: Project, panes: readonly Pane[]): void {
  const queue = project.taskQueue ?? []
  const store = useTaskQueueStore.getState()
  const agents = slotAgentsOf(panes, useWorkspaceStore.getState().activities)
  store.settle(project.id, agents)
  if (queue.length === 0) return
  const launches = useTaskQueueStore.getState().launches[project.id] ?? []
  const busy = busySlots(agents, launches)
  for (const task of tasksToStart(queue, maxAgentsOf(project), busy, launches)) {
    startQueued(project.id, task)
  }
}

/**
 * Starts each project's queued tasks while it has free agent slots (decision 047): when an
 * agent reaches Done or Ready, or closes. Runs only once saved agents are back, so a relaunch
 * never starts more than the limit.
 */
export function useTaskQueueRunner(): void {
  const isRestored = useWorkspaceStore((state) => state.isRestored)
  const projects = useProjectsStore((state) => state.projects)
  const layouts = useWorkspaceStore((state) => state.layouts)
  const activities = useWorkspaceStore((state) => state.activities)
  const launches = useTaskQueueStore((state) => state.launches)
  useEffect(() => {
    if (!isRestored) return
    for (const project of projects) {
      runProjectQueue(project, layouts[project.id]?.panes ?? NO_PANES)
    }
  }, [isRestored, projects, layouts, activities, launches])
}

/** How many of the project's agent slots are taken, for the queue's "2 of 3 busy". */
export function useBusySlots(projectId: ProjectId): number {
  const panes = useWorkspaceStore((state) => state.layouts[projectId]?.panes ?? NO_PANES)
  const activities = useWorkspaceStore((state) => state.activities)
  const launches = useProjectLaunches(projectId)
  return useMemo(
    () => busySlots(slotAgentsOf(panes, activities), launches),
    [panes, activities, launches],
  )
}
