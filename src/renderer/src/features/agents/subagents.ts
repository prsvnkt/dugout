import type { AgentStatus, SubagentUpdate } from '@shared/agentStatus'

/** A subagent as the Agents list shows it: its latest update. */
export type Subagent = SubagentUpdate

/** More than this per agent is noise; the oldest finished ones go first. */
export const MAX_TRACKED_SUBAGENTS = 20

const NEW_TURN_FROM: ReadonlySet<AgentStatus> = new Set(['idle', 'done'])

/** Records a subagent starting or stopping. Unchanged lists are returned as they are. */
export function applySubagentUpdate(
  list: readonly Subagent[],
  update: SubagentUpdate,
): readonly Subagent[] {
  const index = list.findIndex((subagent) => subagent.id === update.id)
  if (index === -1) return trimToLimit([...list, update])
  const current = list[index]
  if (
    current?.state === update.state &&
    current.type === update.type &&
    current.detail === update.detail
  ) {
    return list
  }
  return list.map((subagent, i) => (i === index ? update : subagent))
}

function trimToLimit(list: readonly Subagent[]): readonly Subagent[] {
  if (list.length <= MAX_TRACKED_SUBAGENTS) return list
  const oldestDone = list.findIndex((subagent) => subagent.state === 'done')
  const drop = oldestDone === -1 ? 0 : oldestDone
  return list.filter((_, i) => i !== drop)
}

/** Finished subagents belong to the turn that started them; running ones stay. */
export function clearFinished(list: readonly Subagent[]): readonly Subagent[] {
  return list.some((subagent) => subagent.state === 'done')
    ? list.filter((subagent) => subagent.state === 'running')
    : list
}

/** True when an agent that was waiting for a prompt starts working: a new turn. */
export function startsNewTurn(previous: AgentStatus | null, next: AgentStatus): boolean {
  return next === 'working' && previous !== null && NEW_TURN_FROM.has(previous)
}

/** Running subagents first, then finished ones, up to `max`; the rest are counted. */
export function visibleSubagents(
  list: readonly Subagent[],
  max: number,
): { shown: readonly Subagent[]; hiddenCount: number } {
  const ordered = [
    ...list.filter((subagent) => subagent.state === 'running'),
    ...list.filter((subagent) => subagent.state === 'done'),
  ]
  return { shown: ordered.slice(0, max), hiddenCount: Math.max(0, ordered.length - max) }
}
