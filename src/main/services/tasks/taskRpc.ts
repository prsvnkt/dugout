import { taskRpcSchemas } from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import { DUGOUT_LABEL_PREFIX, type Task, type TaskPriority, type TaskStatus } from '@shared/tasks'
import { priorityRank } from './taskPriority'
import type { TaskService } from './TaskService'
import { MAX_LISTED_TASKS } from './taskTypes'

export type TaskRpcTasks = Pick<TaskService, 'list' | 'get' | 'create' | 'update' | 'comment'>

/**
 * What `list` returns per task: enough to pick one; `get` has the description. Tools take the
 * `number`; `key` is how the task is written in its source ("#12", or "ENG-12" in Linear).
 */
export interface TaskSummary {
  readonly number: number
  readonly key: string
  readonly title: string
  readonly status: TaskStatus
  readonly priority: TaskPriority | null
  /** The task's own labels; status and priority are given above instead. */
  readonly labels: readonly string[]
  readonly updatedAt: string
}

/** What a write returns: the agent already knows what it wrote. */
export interface TaskRef {
  readonly number: number
  readonly key: string
  readonly url: string
  readonly status: TaskStatus
}

export interface TaskList {
  /** Which tasks the list was drawn from, so an empty list is not mistaken for "no tasks". */
  readonly covers: string
  readonly tasks: readonly TaskSummary[]
}

export const LIST_COVERAGE =
  `Open and closed tasks (every status: todo, in-progress, in-review, done), ` +
  `the ${MAX_LISTED_TASKS} most recently updated; pull requests are not included.`

function summary(task: Task): TaskSummary {
  return {
    number: task.number,
    key: task.key,
    title: task.title,
    status: task.status,
    priority: task.priority,
    labels: task.labels.filter((label) => !label.startsWith(DUGOUT_LABEL_PREFIX)),
    updatedAt: task.updatedAt,
  }
}

const ref = (task: Task): TaskRef => ({
  number: task.number,
  key: task.key,
  url: task.url,
  status: task.status,
})

/** Every word of `search` appears in the title or description (case-insensitive). */
function matches(task: Task, search: string): boolean {
  const text = `${task.title}\n${task.body}`.toLowerCase()
  return search
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

function coverage(status: TaskStatus | undefined, search: string | undefined): string {
  const filters = [
    status && `status is ${status}`,
    search && `title or description contains every word of "${search}"`,
  ].filter(Boolean)
  return filters.length > 0
    ? `${LIST_COVERAGE} Only tasks where ${filters.join(' and ')}.`
    : LIST_COVERAGE
}

async function list(tasks: TaskRpcTasks, projectId: ProjectId, params: unknown): Promise<TaskList> {
  const { status, search } = taskRpcSchemas.list.parse(params)
  const all = await tasks.list(projectId)
  const found = all
    .filter((task) => (!status || task.status === status) && (!search || matches(task, search)))
    .map(summary)
    // Highest priority first; within a priority, most recently updated first (as listed).
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
  return { covers: coverage(status, search), tasks: found }
}

/** Creates the tasks in order; if one fails, the error says which ones were already created. */
async function createMany(
  tasks: TaskRpcTasks,
  projectId: ProjectId,
  params: unknown,
): Promise<{ created: TaskRef[] }> {
  const { tasks: inputs } = taskRpcSchemas.createMany.parse(params)
  const created: TaskRef[] = []
  for (const [index, input] of inputs.entries()) {
    try {
      created.push(ref(await tasks.create(projectId, input)))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      const done = created.map((task) => task.key).join(', ') || 'none'
      throw new Error(
        `Task ${index + 1} ("${input.title}") failed: ${reason} Already created: ${done}.`,
        { cause: error },
      )
    }
  }
  return { created }
}

/** Task tool calls from an agent, already scoped to the project of its terminal. */
export async function handleTaskRpc(
  tasks: TaskRpcTasks,
  projectId: ProjectId,
  method: string,
  params: unknown,
): Promise<unknown> {
  switch (method) {
    case 'list':
      return list(tasks, projectId, params)
    case 'get':
      return tasks.get(projectId, taskRpcSchemas.get.parse(params).number)
    case 'create':
      return ref(await tasks.create(projectId, taskRpcSchemas.create.parse(params)))
    case 'createMany':
      return createMany(tasks, projectId, params)
    case 'update': {
      const { number, ...patch } = taskRpcSchemas.update.parse(params)
      return ref(await tasks.update(projectId, number, patch))
    }
    case 'comment': {
      const { number, body } = taskRpcSchemas.comment.parse(params)
      await tasks.comment(projectId, number, body)
      return { ok: true }
    }
    default:
      throw new Error(`Unknown task operation: ${method}`)
  }
}
