import {
  DUGOUT_LABEL_PREFIX,
  TASK_PRIORITIES,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@shared/tasks'

export const GROUP_ORDER: readonly TaskStatus[] = ['in-progress', 'in-review', 'todo', 'done']
/** Done grows forever; only the most recent are listed. */
export const DONE_SHOWN = 10

export interface TaskGroup {
  readonly status: TaskStatus
  readonly tasks: readonly Task[]
}

/** Tasks whose title contains the query, or whose number it is (with or without "#"). */
export function filterTasks(tasks: readonly Task[], query: string): readonly Task[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tasks
  return tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(needle) || String(task.number) === needle.replace('#', ''),
  )
}

/** Non-empty status groups in GROUP_ORDER, with Done capped at DONE_SHOWN. */
export function groupTasks(tasks: readonly Task[]): readonly TaskGroup[] {
  return GROUP_ORDER.map((status) => ({
    status,
    tasks: tasks
      .filter((task) => task.status === status)
      .slice(0, status === 'done' ? DONE_SHOWN : undefined),
  })).filter((group) => group.tasks.length > 0)
}

/** The labels worth showing on a card: everything except Dugout's own status/priority labels. */
export function visibleLabels(labels: readonly string[]): readonly string[] {
  return labels.filter((label) => !label.startsWith(DUGOUT_LABEL_PREFIX))
}

/** The task's priority, from its `dugout:priority-*` label. */
export function priorityOf(labels: readonly string[]): TaskPriority | null {
  return (
    TASK_PRIORITIES.find((priority) =>
      labels.includes(`${DUGOUT_LABEL_PREFIX}priority-${priority}`),
    ) ?? null
  )
}
