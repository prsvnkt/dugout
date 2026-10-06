import { create } from 'zustand'
import type { TaskCreateRequest, TaskUpdateRequest } from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import type { Task, TaskDetail } from '@shared/tasks'
import type { AgentKind } from '@shared/terminal'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

export interface ProjectTasks {
  readonly tasks: readonly Task[] | null
  readonly error: string | null
  readonly selected: number | null
  readonly detail: TaskDetail | null
  readonly isBusy: boolean
}

const EMPTY: ProjectTasks = {
  tasks: null,
  error: null,
  selected: null,
  detail: null,
  isBusy: false,
}

interface TaskState {
  readonly byProject: Readonly<Record<ProjectId, ProjectTasks>>
  refresh(projectId: ProjectId): Promise<void>
  select(projectId: ProjectId, number: number | null): Promise<void>
  /** Each action throws with a user-facing message; the panel shows it. */
  create(request: TaskCreateRequest): Promise<Task>
  update(request: TaskUpdateRequest): Promise<void>
  comment(projectId: ProjectId, number: number, body: string): Promise<void>
  /** Worktree + Claude pane for the task, which moves to In progress. */
  startAgent(projectId: ProjectId, number: number, agents: readonly AgentKind[]): Promise<void>
}

const refreshing = new Set<ProjectId>()

export const useTaskStore = create<TaskState>()((set, get) => {
  const patch = (projectId: ProjectId, change: Partial<ProjectTasks>) =>
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: { ...(state.byProject[projectId] ?? EMPTY), ...change },
      },
    }))
  const current = (projectId: ProjectId) => get().byProject[projectId] ?? EMPTY

  const loadDetail = async (projectId: ProjectId, number: number) => {
    const result = await dugout.tasks.get(projectId, number)
    if (current(projectId).selected !== number) return
    patch(projectId, result.ok ? { detail: result.data } : { error: result.error })
  }

  /** Runs a change, then refreshes the list (and the open task). */
  const mutate = async <T>(projectId: ProjectId, action: () => Promise<T>): Promise<T> => {
    patch(projectId, { isBusy: true, error: null })
    try {
      return await action()
    } finally {
      patch(projectId, { isBusy: false })
      await get().refresh(projectId)
    }
  }

  return {
    byProject: {},

    async refresh(projectId) {
      if (refreshing.has(projectId)) return
      refreshing.add(projectId)
      try {
        const result = await dugout.tasks.list(projectId)
        patch(projectId, result.ok ? { tasks: result.data, error: null } : { error: result.error })
        const { selected } = current(projectId)
        if (result.ok && selected !== null) await loadDetail(projectId, selected)
      } finally {
        refreshing.delete(projectId)
      }
    },

    async select(projectId, number) {
      patch(projectId, { selected: number, detail: null })
      if (number !== null) await loadDetail(projectId, number)
    },

    create: (request) =>
      mutate(request.projectId, async () => unwrap(await dugout.tasks.create(request))),

    update: (request) =>
      mutate(request.projectId, async () => {
        unwrap(await dugout.tasks.update(request))
      }),

    comment: (projectId, number, body) =>
      mutate(projectId, async () => unwrap(await dugout.tasks.comment(projectId, number, body))),

    startAgent: (projectId, number, agents) =>
      mutate(projectId, async () => {
        const started = unwrap(await dugout.tasks.startSession(projectId, number, agents))
        for (const session of started.sessions) {
          useWorkspaceStore.getState().addPane(projectId, session.agent, session.worktree, {
            task: started.task,
            initialPrompt: started.prompt,
          })
        }
      }),
  }
})

export function useProjectTasks(projectId: ProjectId): ProjectTasks {
  return useTaskStore((state) => state.byProject[projectId] ?? EMPTY)
}
