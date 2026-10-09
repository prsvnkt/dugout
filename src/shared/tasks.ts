export const TASK_STATUSES = ['todo', 'in-progress', 'in-review', 'done'] as const

/** Where a task is in its life: derived from the issue's state and Dugout's status labels. */
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskComment {
  readonly author: string
  readonly body: string
  readonly createdAt: string
}

/**
 * A project task: a GitHub issue or a Linear issue. `number` identifies it within the project's
 * task source (the issue number, or the number in a Linear identifier such as ENG-123); `key` is
 * how people write it ("#12" or "ENG-123").
 */
export interface Task {
  readonly number: number
  readonly key: string
  readonly title: string
  readonly body: string
  readonly status: TaskStatus
  readonly url: string
  readonly author: string
  readonly labels: readonly string[]
  readonly priority: TaskPriority | null
  /** Null when the source does not report it in lists (Linear). */
  readonly commentCount: number | null
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

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const

/** How soon a task should be done; stored as a `dugout:priority-*` label. */
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const MAX_TASK_LABELS = 10
export const MAX_TASK_LABEL_LENGTH = 50
export const MAX_RELATED_TASKS = 20
export const MAX_TASK_BATCH = 20
export const MAX_TASK_SEARCH_LENGTH = 200
/** Prefix of the labels Dugout manages itself (status and priority). */
export const DUGOUT_LABEL_PREFIX = 'dugout:'

/** Where a project's tasks live. Projects without one use GitHub Issues (decision 051). */
export type TaskSource =
  | { readonly kind: 'github' }
  | {
      readonly kind: 'linear'
      /** The Linear team whose issues are the project's tasks, by its key (e.g. "ENG"). */
      readonly teamKey: string
    }

export const GITHUB_TASK_SOURCE: TaskSource = { kind: 'github' }
/** Linear team keys: an uppercase letter, then uppercase letters or digits. */
export const LINEAR_TEAM_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,9}$/

export function taskSourceOf(project: {
  readonly taskSource?: TaskSource | undefined
}): TaskSource {
  return project.taskSource ?? GITHUB_TASK_SOURCE
}

/** How a task number is written in a source: "#12", or "ENG-12" for Linear. */
export function taskKey(source: TaskSource, number: number): string {
  return source.kind === 'linear' ? `${source.teamKey}-${number}` : `#${number}`
}

/** A task remembered by a pane; layouts saved before decision 051 have no `key`. */
export function displayTaskKey(task: {
  readonly number: number
  readonly key?: string | undefined
}): string {
  return task.key ?? `#${task.number}`
}
