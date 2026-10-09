import { AGENTS, type AgentKind } from '@shared/agents'
import type { SessionTimeline } from '@shared/timeline'
import type { AgentTimelineReader } from '../agents/AgentAdapter'
import { buildTimeline } from '../transcripts/timelineSteps'
import { allowedPath, readTranscriptTail } from '../transcripts/transcriptFiles'

/** A long session is read from its last this-many bytes: its latest steps. */
export const MAX_TIMELINE_BYTES = 16 * 1024 * 1024

export interface TimelineSource {
  readonly reader: AgentTimelineReader
  /** The folder its transcripts must be in (the usage reader's, resolved once at start). */
  readonly root: string
}

export interface TimelineServiceDeps {
  readonly sources: Readonly<Partial<Record<AgentKind, TimelineSource>>>
  readonly maxBytes?: number
}

/**
 * Builds a session's timeline from its transcript, read-only, on request (decision 048). The
 * transcript is found by session id under the agent's own folder, and read only if its real path
 * is still inside that folder.
 */
export class TimelineService {
  constructor(private readonly deps: TimelineServiceDeps) {}

  async timeline(agent: AgentKind, sessionId: string): Promise<SessionTimeline> {
    const source = this.deps.sources[agent]
    if (!source) throw new Error(`${AGENTS[agent].label} sessions have no timeline.`)
    const found = await source.reader.find(source.root, sessionId)
    const path = found && (await allowedPath(found, source.root))
    if (!path) throw new Error('No transcript for this session yet. Try again once it has started.')
    const { lines, isCut } = await readTranscriptTail(
      path,
      this.deps.maxBytes ?? MAX_TIMELINE_BYTES,
    )
    const parts = buildTimeline(source.reader.read(lines))
    return { agent, sessionId, ...parts, isTruncated: parts.isTruncated || isCut }
  }
}
