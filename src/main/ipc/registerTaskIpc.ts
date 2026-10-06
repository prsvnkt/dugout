import { IpcChannel } from '@shared/ipc/channels'
import {
  taskCommentRequestSchema,
  taskCreateRequestSchema,
  taskListRequestSchema,
  taskNumberRequestSchema,
  taskUpdateRequestSchema,
} from '@shared/ipc/contract'
import type { TaskSession } from '@shared/taskSession'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { TaskService } from '../services/tasks/TaskService'
import { taskBranchName, taskPrompt } from '../services/tasks/taskSession'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

export interface TaskIpcDeps {
  readonly tasks: TaskService
  readonly projects: ProjectStore
  readonly worktrees: WorktreeManager
  readonly webBaseUrl: string
  readonly openExternal: (url: string) => Promise<void>
}

export function registerTaskIpc({
  tasks,
  projects,
  worktrees,
  webBaseUrl,
  openExternal,
}: TaskIpcDeps): void {
  handleRequest(IpcChannel.tasksList, taskListRequestSchema, ({ projectId }) =>
    tasks.list(projectId),
  )
  handleRequest(IpcChannel.tasksGet, taskNumberRequestSchema, ({ projectId, number }) =>
    tasks.get(projectId, number),
  )
  handleRequest(IpcChannel.tasksCreate, taskCreateRequestSchema, ({ projectId, ...input }) =>
    tasks.create(projectId, input),
  )
  handleRequest(
    IpcChannel.tasksUpdate,
    taskUpdateRequestSchema,
    ({ projectId, number, ...patch }) => tasks.update(projectId, number, patch),
  )
  handleRequest(IpcChannel.tasksComment, taskCommentRequestSchema, ({ projectId, number, body }) =>
    tasks.comment(projectId, number, body),
  )

  // Opens the issue's own page, and only on the GitHub host.
  handleRequest(IpcChannel.tasksOpen, taskNumberRequestSchema, async ({ projectId, number }) => {
    const task = await tasks.get(projectId, number)
    if (new URL(task.url).origin !== new URL(webBaseUrl).origin)
      throw new Error('Unexpected issue URL.')
    await openExternal(task.url)
  })

  /** Start agent: a worktree named after the task, marked in progress, with its first prompt. */
  handleRequest(
    IpcChannel.tasksStartSession,
    taskNumberRequestSchema,
    async ({ projectId, number }): Promise<TaskSession> => {
      const task = await tasks.get(projectId, number)
      const worktree = await worktrees.create(findProject(projects, projectId), {
        name: taskBranchName(task.number, task.title),
      })
      if (task.status !== 'in-progress')
        await tasks.update(projectId, number, { status: 'in-progress' })
      return {
        worktree,
        prompt: taskPrompt(task),
        task: { number: task.number, title: task.title },
      }
    },
  )
}
