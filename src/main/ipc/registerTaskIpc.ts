import { IpcChannel } from '@shared/ipc/channels'
import {
  taskCommentRequestSchema,
  taskCreateRequestSchema,
  taskListRequestSchema,
  taskNumberRequestSchema,
  taskStartSessionRequestSchema,
  taskUpdateRequestSchema,
} from '@shared/ipc/contract'
import type { TaskSession } from '@shared/taskSession'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { TaskService } from '../services/tasks/TaskService'
import { taskBranchName, taskPrompt } from '../services/tasks/taskSession'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest, type IpcMainLike } from './handle'
import { findProject } from './registerGitIpc'

export interface TaskIpcDeps {
  readonly tasks: TaskService
  readonly projects: ProjectStore
  readonly worktrees: WorktreeManager
  readonly openExternal: (url: string) => Promise<void>
}

export function registerTaskIpc(
  { tasks, projects, worktrees, openExternal }: TaskIpcDeps,
  ipc?: IpcMainLike,
): void {
  handleRequest(
    IpcChannel.tasksList,
    taskListRequestSchema,
    ({ projectId }) => tasks.list(projectId),
    ipc,
  )
  handleRequest(
    IpcChannel.tasksGet,
    taskNumberRequestSchema,
    ({ projectId, number }) => tasks.get(projectId, number),
    ipc,
  )
  handleRequest(
    IpcChannel.tasksCreate,
    taskCreateRequestSchema,
    ({ projectId, ...input }) => tasks.create(projectId, input),
    ipc,
  )
  handleRequest(
    IpcChannel.tasksUpdate,
    taskUpdateRequestSchema,
    ({ projectId, number, ...patch }) => tasks.update(projectId, number, patch),
    ipc,
  )
  handleRequest(
    IpcChannel.tasksComment,
    taskCommentRequestSchema,
    ({ projectId, number, body }) => tasks.comment(projectId, number, body),
    ipc,
  )

  // Opens the task's own page, and only on its source's host (GitHub or Linear).
  handleRequest(
    IpcChannel.tasksOpen,
    taskNumberRequestSchema,
    async ({ projectId, number }) => {
      await openExternal(await tasks.webUrl(projectId, number))
    },
    ipc,
  )

  /** Start agent: a worktree named after the task, marked in progress, with its first prompt. */
  handleRequest(
    IpcChannel.tasksStartSession,
    taskStartSessionRequestSchema,
    async ({ projectId, number, agents }): Promise<TaskSession> => {
      const task = await tasks.get(projectId, number)
      const project = findProject(projects, projectId)
      const branch = taskBranchName(task.number, task.title)
      // One worktree per agent; with several, each name says which agent it belongs to.
      const sessions = []
      for (const agent of agents) {
        const name = agents.length > 1 ? `${branch}-${agent}` : branch
        sessions.push({ agent, worktree: await worktrees.create(project, { name }) })
      }
      if (task.status !== 'in-progress') {
        await tasks.update(projectId, number, { status: 'in-progress' })
      }
      return {
        sessions,
        prompt: taskPrompt(task),
        task: { number: task.number, key: task.key, title: task.title },
      }
    },
    ipc,
  )
}
