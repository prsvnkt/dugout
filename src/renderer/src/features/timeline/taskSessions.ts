import { AGENT_LABEL, type AgentKind } from '@shared/agents'
import { isAgentKind } from '@shared/terminal'
import type { Pane } from '@renderer/features/workspace/layout'
import type { RecentSession } from '@renderer/features/workspace/recentSessions'
import { hasTimeline } from './timelineFormat'

/** An agent session on a task whose timeline can be opened. */
export interface TaskSession {
  readonly agent: AgentKind
  readonly sessionId: string
  /** "Claude", "Claude 2" when several, "(closed)" for sessions no longer open. */
  readonly label: string
}

interface Candidate {
  readonly agent: AgentKind
  readonly sessionId: string
  readonly isClosed: boolean
}

/**
 * The sessions that worked on a task: its open agents first, then the closed ones the project
 * still remembers, each once, for agents with timelines.
 */
export function taskSessions(
  panes: readonly Pane[],
  recent: readonly RecentSession[],
  taskNumber: number,
): readonly TaskSession[] {
  const open = panes.flatMap((pane): Candidate[] =>
    pane.task?.number === taskNumber && pane.sessionId && isAgentKind(pane.kind)
      ? [{ agent: pane.kind, sessionId: pane.sessionId, isClosed: false }]
      : [],
  )
  const closed = recent.flatMap((entry): Candidate[] =>
    entry.task?.number === taskNumber
      ? [{ agent: entry.kind, sessionId: entry.sessionId, isClosed: true }]
      : [],
  )
  const seen = new Set<string>()
  const unique = [...open, ...closed].filter((candidate) => {
    if (!hasTimeline(candidate.agent) || seen.has(candidate.sessionId)) return false
    seen.add(candidate.sessionId)
    return true
  })
  const perAgent = new Map<AgentKind, number>()
  return unique.map(({ agent, sessionId, isClosed }) => {
    const nth = (perAgent.get(agent) ?? 0) + 1
    perAgent.set(agent, nth)
    const name = nth === 1 ? AGENT_LABEL[agent] : `${AGENT_LABEL[agent]} ${nth}`
    return { agent, sessionId, label: isClosed ? `${name} (closed)` : name }
  })
}
