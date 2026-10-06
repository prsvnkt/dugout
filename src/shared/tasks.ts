export const TASK_STATUSES = ['todo', 'in-progress', 'in-review', 'done'] as const

/** Where a task is in its life: derived from the issue's state and Dugout's status labels. */
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskComment {
  readonly author: string
  readonly body: string
  readonly createdAt: string
}

/** A project task, backed by a GitHub Issue. */
export interface Task {
  readonly number: number
  readonly title: string
  readonly body: string
  readonly status: TaskStatus
  readonly url: string
  readonly author: string
  readonly labels: readonly string[]
  readonly commentCount: number
  readonly updatedAt: string
}

export interface TaskDetail extends Task {
  readonly comments: readonly TaskComment[]
}

export const TASK_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  todo: 'To do',
  'in-progress': 'In progress',
  'in-review': 'In review',
  done: 'Done',
}

export const MAX_TASK_TITLE_LENGTH = 256
export const MAX_TASK_BODY_LENGTH = 65_000
