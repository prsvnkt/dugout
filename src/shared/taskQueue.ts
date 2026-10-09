import type { AgentKind } from './agents'

/** A task waiting for a free agent slot in its project (decision 047). */
export interface QueuedTask {
  readonly number: number
  /** How its source writes it: "#12" or "ENG-12". */
  readonly key: string
  readonly title: string
  /** The agent to start on it, in its own worktree. */
  readonly agent: AgentKind
}

/** One edit to a project's queue; main applies it, so concurrent edits never undo each other. */
export type TaskQueueChange =
  | { readonly kind: 'add'; readonly task: QueuedTask }
  | { readonly kind: 'remove'; readonly number: number }
  | { readonly kind: 'move'; readonly number: number; readonly offset: -1 | 1 }

/** Agents a project runs at once when queueing, unless it sets its own limit. */
export const DEFAULT_MAX_AGENTS = 3
export const MIN_MAX_AGENTS = 1
export const MAX_MAX_AGENTS = 20
export const MAX_QUEUED_TASKS = 100
export const MAX_TASK_KEY_LENGTH = 40

export function maxAgentsOf(project: { readonly maxAgents?: number | undefined }): number {
  return project.maxAgents ?? DEFAULT_MAX_AGENTS
}

/** The queue after a change; the same array when nothing changes. Throws when it is full. */
export function applyQueueChange(
  queue: readonly QueuedTask[],
  change: TaskQueueChange,
): readonly QueuedTask[] {
  switch (change.kind) {
    case 'add':
      return enqueue(queue, change.task)
    case 'remove':
      return queue.some((entry) => entry.number === change.number)
        ? queue.filter((entry) => entry.number !== change.number)
        : queue
    case 'move':
      return move(queue, change.number, change.offset)
  }
}

function enqueue(queue: readonly QueuedTask[], task: QueuedTask): readonly QueuedTask[] {
  if (queue.some((entry) => entry.number === task.number)) {
    return queue.map((entry) => (entry.number === task.number ? task : entry))
  }
  if (queue.length >= MAX_QUEUED_TASKS) {
    throw new Error(`The queue holds at most ${MAX_QUEUED_TASKS} tasks.`)
  }
  return [...queue, task]
}

function move(queue: readonly QueuedTask[], number: number, offset: -1 | 1) {
  const from = queue.findIndex((entry) => entry.number === number)
  if (from === -1) return queue
  const to = from + offset
  const moved = queue[from]
  const swapped = queue[to]
  if (!moved || !swapped) return queue
  return queue.map((entry, index) => (index === from ? swapped : index === to ? moved : entry))
}
