import { AGENT_LABEL, AGENTS, type AgentKind } from '@shared/agents'
import type { SessionTimeline, TimelineOutcome } from '@shared/timeline'

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60

export const OUTCOME_LABEL: Readonly<Record<TimelineOutcome, string>> = {
  ok: 'Succeeded',
  failed: 'Failed',
  pending: 'No result yet',
}

/** Whether Dugout can show a timeline for this kind of agent (OpenCode has no transcript). */
export function hasTimeline(kind: AgentKind): boolean {
  return AGENTS[kind].capabilities.hasTimeline
}

/** A timeline tab's name: "Timeline · Claude", with the task's key when it has one. */
export function timelineTitle(agent: AgentKind, taskKey?: string): string {
  return ['Timeline', AGENT_LABEL[agent], ...(taskKey ? [taskKey] : [])].join(' · ')
}

/** "14:05:09" for an ISO timestamp, in local time; empty when it has none. */
export function formatClock(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  return new Date(time).toLocaleTimeString('en-GB', { hour12: false })
}

/** "45s", "12m", "2h 5m" between two ISO timestamps; null when either is missing. */
export function formatDuration(from: string | null, to: string | null): string | null {
  if (!from || !to) return null
  const seconds = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000))
  if (Number.isNaN(seconds)) return null
  if (seconds < SECONDS_PER_MINUTE) return `${seconds}s`
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

export interface TimelineCounts {
  readonly prompts: number
  readonly tools: number
  readonly failed: number
  readonly subagents: number
  readonly edited: number
}

export function countTimeline(timeline: SessionTimeline): TimelineCounts {
  const count = (test: (event: SessionTimeline['events'][number]) => boolean) =>
    timeline.events.filter(test).length
  return {
    prompts: count((event) => event.kind === 'prompt'),
    tools: count((event) => event.kind === 'tool'),
    failed: count((event) => 'outcome' in event && event.outcome === 'failed'),
    subagents: count((event) => event.kind === 'subagent'),
    edited: timeline.files.filter((file) => file.change === 'edited').length,
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** "3 prompts · 24 tool calls (2 failed) · 1 subagent · 5 files edited" */
export function summarize(counts: TimelineCounts): string {
  const tools = plural(counts.tools, 'tool call')
  return [
    plural(counts.prompts, 'prompt'),
    counts.failed > 0 ? `${tools} (${counts.failed} failed)` : tools,
    plural(counts.subagents, 'subagent'),
    `${plural(counts.edited, 'file')} edited`,
  ].join(' · ')
}
