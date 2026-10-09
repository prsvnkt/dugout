import type { AgentKind } from '@shared/agents'
import { AGENT_ADAPTERS } from '../agents/registry'
import { TimelineService, type TimelineSource } from './TimelineService'

/** Every agent with `hasTimeline`, reading from its usage reader's transcript folder. */
export function timelineSources(
  homeDir: string,
  env: Readonly<Record<string, string | undefined>>,
): Partial<Record<AgentKind, TimelineSource>> {
  return Object.fromEntries(
    Object.values(AGENT_ADAPTERS).flatMap((adapter) =>
      adapter.timeline && adapter.usage
        ? [
            [
              adapter.info.kind,
              { reader: adapter.timeline, root: adapter.usage.transcriptRoot(homeDir, env) },
            ],
          ]
        : [],
    ),
  )
}

export function setupTimeline(options: {
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}): TimelineService {
  return new TimelineService({ sources: timelineSources(options.homeDir, options.env) })
}
