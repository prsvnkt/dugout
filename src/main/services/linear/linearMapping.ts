import type { TaskPriority, TaskStatus } from '@shared/tasks'
import { STATUS_LABELS } from '../tasks/taskStatus'

/** A team's workflow state. `type` is Linear's category for it. */
export interface LinearWorkflowState {
  readonly id: string
  readonly name: string
  /** "triage", "backlog", "unstarted", "started", "completed", "canceled" or "duplicate". */
  readonly type: string
  readonly position: number
}

/** Teams without a review state get this label on started issues instead (decision 051). */
export const IN_REVIEW_LABEL = STATUS_LABELS['in-review']
const REVIEW_NAME = /review/i
const DONE_TYPES = new Set(['completed', 'canceled', 'duplicate'])

/**
 * A Linear issue's Dugout status, from its state's type: completed/canceled → done; started →
 * in review when the state's name says "review" (or the issue has the in-review label), else in
 * progress; triage, backlog and unstarted → to do.
 */
export function statusOfLinear(
  state: Pick<LinearWorkflowState, 'name' | 'type'>,
  labels: readonly string[],
): TaskStatus {
  if (DONE_TYPES.has(state.type)) return 'done'
  if (state.type !== 'started') return 'todo'
  return REVIEW_NAME.test(state.name) || labels.includes(IN_REVIEW_LABEL)
    ? 'in-review'
    : 'in-progress'
}

/** The workflow state for a status, and whether it needs the in-review label to say so. */
export interface LinearStatusTarget {
  readonly stateId: string
  readonly needsReviewLabel: boolean
}

function firstOf(
  states: readonly LinearWorkflowState[],
  match: (state: LinearWorkflowState) => boolean,
): LinearWorkflowState | undefined {
  return [...states].sort((a, b) => a.position - b.position).find(match)
}

function stateFor(
  states: readonly LinearWorkflowState[],
  status: TaskStatus,
): { state: LinearWorkflowState | undefined; needsReviewLabel: boolean } {
  const ofType = (type: string) => (state: LinearWorkflowState) => state.type === type
  const working = (state: LinearWorkflowState) =>
    state.type === 'started' && !REVIEW_NAME.test(state.name)
  switch (status) {
    case 'todo':
      return {
        state: firstOf(states, ofType('unstarted')) ?? firstOf(states, ofType('backlog')),
        needsReviewLabel: false,
      }
    case 'in-progress':
      return {
        state: firstOf(states, working) ?? firstOf(states, ofType('started')),
        needsReviewLabel: false,
      }
    case 'in-review': {
      const review = firstOf(states, (state) => state.type === 'started' && !working(state))
      return review
        ? { state: review, needsReviewLabel: false }
        : { state: firstOf(states, ofType('started')), needsReviewLabel: true }
    }
    case 'done':
      return { state: firstOf(states, ofType('completed')), needsReviewLabel: false }
  }
}

/**
 * Where to move an issue for a Dugout status: the first state (by position) of the matching
 * type; "in review" prefers a started state named like "In Review", else the first started
 * state plus the in-review label.
 */
export function linearStatusTarget(
  states: readonly LinearWorkflowState[],
  status: TaskStatus,
): LinearStatusTarget {
  const { state, needsReviewLabel } = stateFor(states, status)
  if (!state) throw new Error(`This Linear team has no workflow state for "${status}".`)
  return { stateId: state.id, needsReviewLabel }
}

/** Linear priorities: 0 none, 1 urgent, 2 high, 3 medium, 4 low. Urgent reads as high. */
const LINEAR_PRIORITY: Readonly<Record<TaskPriority, number>> = { high: 2, medium: 3, low: 4 }
const URGENT = 1
const NO_PRIORITY = 0

export function priorityFromLinear(priority: number): TaskPriority | null {
  if (priority === URGENT) return 'high'
  const entry = Object.entries(LINEAR_PRIORITY).find(([, value]) => value === priority)
  return entry ? (entry[0] as TaskPriority) : null
}

export function priorityToLinear(priority: TaskPriority | null): number {
  return priority ? LINEAR_PRIORITY[priority] : NO_PRIORITY
}
