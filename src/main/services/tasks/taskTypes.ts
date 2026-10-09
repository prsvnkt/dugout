import type { Task, TaskDetail, TaskPriority, TaskStatus } from '@shared/tasks'

export interface TaskInput {
  readonly title: string
  readonly body: string
  readonly labels?: readonly string[] | undefined
  readonly priority?: TaskPriority | undefined
  /** Task numbers written as "Related: …" lines at the end of the description. */
  readonly related?: readonly number[] | undefined
}

export interface TaskPatch {
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly status?: TaskStatus | undefined
  /** `null` removes the priority. */
  readonly priority?: TaskPriority | null | undefined
  readonly addLabels?: readonly string[] | undefined
  readonly removeLabels?: readonly string[] | undefined
  readonly related?: readonly number[] | undefined
}

/** One project's tasks in its source (GitHub Issues or a Linear team), credentials applied. */
export interface TaskProvider {
  /** Only links to this origin are opened in the browser. */
  readonly webOrigin: string
  list(): Promise<Task[]>
  get(number: number): Promise<TaskDetail>
  create(input: TaskInput): Promise<Task>
  update(number: number, patch: TaskPatch): Promise<Task>
  comment(number: number, body: string): Promise<void>
}

/** `list` returns at most this many tasks: the most recently updated ones. */
export const MAX_LISTED_TASKS = 300
