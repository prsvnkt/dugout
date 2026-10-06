import type { TaskStatus } from '@shared/tasks'

/** Labels Dugout puts on GitHub issues to track work in progress and in review. */
export const STATUS_LABELS = {
  'in-progress': 'dugout:in-progress',
  'in-review': 'dugout:in-review',
} as const

export const STATUS_LABEL_COLORS: Readonly<Record<keyof typeof STATUS_LABELS, string>> = {
  'in-progress': '60a5fa',
  'in-review': 'fbbf24',
}

const DUGOUT_LABELS: readonly string[] = Object.values(STATUS_LABELS)

export function statusOf(state: string, labels: readonly string[]): TaskStatus {
  if (state === 'closed') return 'done'
  if (labels.includes(STATUS_LABELS['in-review'])) return 'in-review'
  if (labels.includes(STATUS_LABELS['in-progress'])) return 'in-progress'
  return 'todo'
}

/** The issue state and label set that express `status`, keeping non-Dugout labels. */
export function labelsForStatus(
  labels: readonly string[],
  status: TaskStatus,
): { state: 'open' | 'closed'; labels: string[] } {
  const others = labels.filter((label) => !DUGOUT_LABELS.includes(label))
  switch (status) {
    case 'todo':
      return { state: 'open', labels: others }
    case 'in-progress':
    case 'in-review':
      return { state: 'open', labels: [...others, STATUS_LABELS[status]] }
    case 'done':
      return { state: 'closed', labels: others }
  }
}
