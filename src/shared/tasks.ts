/** Every task status, in board order (also the values the MCP tools accept). */
export const TASK_STATUSES = ['todo', 'in-progress', 'in-review', 'done'] as const

/**
 * Where a task is in its life: from the issue's state and Dugout's status labels (GitHub), or
 * from its workflow state's type (Linear, decision 051).
 */
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** One comment on a task, oldest first in `TaskDetail.comments`. */
export interface TaskComment {
  /** The GitHub login or Linear user name. */
  readonly author: string
  /** Markdown, as written in the source. */
  readonly body: string
  /** ISO 8601 timestamp. */
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
  /** The description, in Markdown. */
  readonly body: string
  readonly status: TaskStatus
  /** The issue's page on GitHub or Linear. */
  readonly url: string
  /** Who filed it: the GitHub login or Linear user name. */
  readonly author: string
  /** Every label, including Dugout's own `dugout:*` ones. */
  readonly labels: readonly string[]
  readonly priority: TaskPriority | null
  /** Null when the source does not report it in lists (Linear). */
  readonly commentCount: number | null
  /** ISO 8601 timestamp of the last change; lists are newest first. */
  readonly updatedAt: string
}

/** A task with its comments, as `get_task` and the task tab read it. */
export interface TaskDetail extends Task {
  readonly comments: readonly TaskComment[]
}

/** How each status reads in the UI. */
export const TASK_STATUS_LABEL: Readonly<Record<TaskStatus, string>> = {
  todo: 'To do',
  'in-progress': 'In progress',
  'in-review': 'In review',
  done: 'Done',
}

// Limits on what the UI and agents may send; main's zod schemas enforce them.
export const MAX_TASK_TITLE_LENGTH = 256
export const MAX_TASK_BODY_LENGTH = 65_000

/** Every priority, highest first; a task may also have none (null). */
export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const

/**
 * How soon a task should be done: a `dugout:priority-*` label on GitHub (decision 034), Linear's
 * own priority on Linear (decision 051).
 */
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

/** The default source: the GitHub Issues of the project's `origin` repo. */
export const GITHUB_TASK_SOURCE: TaskSource = { kind: 'github' }
/** Linear team keys: an uppercase letter, then uppercase letters or digits. */
export const LINEAR_TEAM_KEY_PATTERN = /^[A-Z][A-Z0-9]{0,9}$/

/** The project's task source, GitHub Issues when it has none set. */
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
