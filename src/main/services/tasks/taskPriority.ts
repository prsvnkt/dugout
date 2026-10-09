import type { TaskPriority } from '@shared/tasks'

/** Labels Dugout puts on GitHub issues to record a task's priority. */
export const PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  high: 'dugout:priority-high',
  medium: 'dugout:priority-medium',
  low: 'dugout:priority-low',
}

export const PRIORITY_LABEL_COLORS: Readonly<Record<TaskPriority, string>> = {
  high: 'ef4444',
  medium: 'f97316',
  low: '9ca3af',
}

const PRIORITY_ORDER: readonly TaskPriority[] = ['high', 'medium', 'low']

export function priorityOf(labels: readonly string[]): TaskPriority | null {
  return PRIORITY_ORDER.find((priority) => labels.includes(PRIORITY_LABELS[priority])) ?? null
}

/** The labels with exactly one priority label (or none, for `null`), keeping the others. */
export function labelsForPriority(
  labels: readonly string[],
  priority: TaskPriority | null,
): string[] {
  const priorityLabels: readonly string[] = Object.values(PRIORITY_LABELS)
  const others = labels.filter((label) => !priorityLabels.includes(label))
  return priority ? [...others, PRIORITY_LABELS[priority]] : others
}

/** Sort rank: high first, tasks without a priority last. */
export function priorityRank(priority: TaskPriority | null): number {
  return priority ? PRIORITY_ORDER.indexOf(priority) : PRIORITY_ORDER.length
}
