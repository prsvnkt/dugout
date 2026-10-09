import { create } from 'zustand'
import type { TaskCreateRequest, TaskUpdateRequest } from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import type { Task, TaskDetail } from '@shared/tasks'
import type { AgentKind } from '@shared/terminal'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'
import { useTaskQueueStore } from '@renderer/features/taskQueue/taskQueueStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

export interface ProjectTasks {
  readonly tasks: readonly Task[] | null
  readonly error: string | null
  /** Tasks shown in a task tab right now; refreshes reload their details. */
  readonly viewing: readonly number[]
  /** Last loaded details, kept so switching tabs shows a task at once. */
  readonly details: Readonly<Record<number, TaskDetail>>
  /** Why a task's details failed to load. */
  readonly detailErrors: Readonly<Record<number, string>>
  readonly isBusy: boolean
}

const EMPTY: ProjectTasks = {
  tasks: null,
  error: null,
  viewing: [],
  details: {},
  detailErrors: {},
  isBusy: false,
}

interface TaskState {
  readonly byProject: Readonly<Record<ProjectId, ProjectTasks>>
  refresh(projectId: ProjectId): Promise<void>
  /** Forgets the project's tasks, e.g. when it switches task source; late answers are dropped. */
  reset(projectId: ProjectId): void
  /** A task tab shows the task: load its details and keep them fresh until `unview`. */
  view(projectId: ProjectId, number: number): Promise<void>
  unview(projectId: ProjectId, number: number): void
  /** Each action throws with a user-facing message; the panel shows it. */
  create(request: TaskCreateRequest): Promise<Task>
  update(request: TaskUpdateRequest): Promise<void>
  comment(projectId: ProjectId, number: number, body: string): Promise<void>
  /** Worktree + Claude pane for the task, which moves to In progress. */
  startAgent(projectId: ProjectId, number: number, agents: readonly AgentKind[]): Promise<void>
}

const refreshing = new Set<ProjectId>()
/** Bumped by `reset`, so a refresh that started before it does not write old tasks back. */
const epochs = new Map<ProjectId, number>()
const epochOf = (projectId: ProjectId) => epochs.get(projectId) ?? 0

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
    const { details, detailErrors } = current(projectId)
    const otherErrors = Object.fromEntries(
      Object.entries(detailErrors).filter(([key]) => Number(key) !== number),
    )
    patch(
      projectId,
      result.ok
        ? { details: { ...details, [number]: result.data }, detailErrors: otherErrors }
        : { detailErrors: { ...otherErrors, [number]: result.error } },
    )
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
      const epoch = epochOf(projectId)
      try {
        const result = await dugout.tasks.list(projectId)
        if (epochOf(projectId) !== epoch) return
        patch(projectId, result.ok ? { tasks: result.data, error: null } : { error: result.error })
        if (result.ok) {
          await Promise.all(
            current(projectId).viewing.map((number) => loadDetail(projectId, number)),
          )
        }
      } finally {
        if (epochOf(projectId) === epoch) refreshing.delete(projectId)
      }
    },

    reset(projectId) {
      epochs.set(projectId, epochOf(projectId) + 1)
      refreshing.delete(projectId)
      set((state) => {
        const { [projectId]: _removed, ...rest } = state.byProject
        return { byProject: rest }
      })
    },

    async view(projectId, number) {
      const { viewing } = current(projectId)
      if (!viewing.includes(number)) patch(projectId, { viewing: [...viewing, number] })
      await loadDetail(projectId, number)
    },

    unview(projectId, number) {
      const { viewing } = current(projectId)
      if (viewing.includes(number)) {
        patch(projectId, { viewing: viewing.filter((candidate) => candidate !== number) })
      }
    },

    create: (request) =>
      mutate(request.projectId, async () => unwrap(await dugout.tasks.create(request))),

    update: (request) =>
      mutate(request.projectId, async () => {
        unwrap(await dugout.tasks.update(request))
      }),

    comment: (projectId, number, body) =>
      mutate(projectId, async () => unwrap(await dugout.tasks.comment(projectId, number, body))),

    startAgent: (projectId, number, agents) => {
      // Synchronously, so the queue counts this start before it could start another.
      const queue = useTaskQueueStore.getState()
      queue.beginLaunch(projectId, number)
      return mutate(projectId, async () => {
        try {
          const started = unwrap(await dugout.tasks.startSession(projectId, number, agents))
          for (const session of started.sessions) {
            useWorkspaceStore.getState().addPane(projectId, session.agent, session.worktree, {
              task: started.task,
              initialPrompt: started.prompt,
            })
          }
          queue.markStarted(projectId, number)
        } catch (error) {
          queue.endLaunch(projectId, number)
          throw error
        }
      })
    },
  }
})

export function useProjectTasks(projectId: ProjectId): ProjectTasks {
  return useTaskStore((state) => state.byProject[projectId] ?? EMPTY)
}
