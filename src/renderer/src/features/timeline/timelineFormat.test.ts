import { describe, expect, test } from 'vitest'
import type { SessionTimeline } from '@shared/timeline'
import {
  countTimeline,
  formatDuration,
  hasTimeline,
  summarize,
  timelineTitle,
} from './timelineFormat'

const TIMELINE: SessionTimeline = {
  agent: 'claude',
  sessionId: 's-1',
  events: [
    { kind: 'prompt', at: '', text: 'Fix it' },
    { kind: 'tool', at: '', id: 't1', name: 'Bash', detail: 'npm test', outcome: 'failed' },
    { kind: 'tool', at: '', id: 't2', name: 'Edit', detail: 'a.ts', outcome: 'ok' },
    { kind: 'subagent', at: '', id: 't3', agentType: null, detail: 'Review', outcome: 'ok' },
  ],
  files: [
    { path: 'a.ts', change: 'edited' },
    { path: 'b.ts', change: 'read' },
  ],
  finalMessage: 'Done',
  startedAt: null,
  endedAt: null,
  isTruncated: false,
}

describe('timeline format', () => {
  test('names tabs by agent, and task when there is one', () => {
    expect(timelineTitle('claude')).toBe('Timeline · Claude')
    expect(timelineTitle('codex', 'ENG-12')).toBe('Timeline · Codex · ENG-12')
  })

  test('offers timelines only for agents with transcripts', () => {
    expect(hasTimeline('claude')).toBe(true)
    expect(hasTimeline('codex')).toBe(true)
    expect(hasTimeline('opencode')).toBe(false)
  })

  test('counts and summarizes what happened', () => {
    const counts = countTimeline(TIMELINE)
    expect(counts).toEqual({ prompts: 1, tools: 2, failed: 1, subagents: 1, edited: 1 })
    expect(summarize(counts)).toBe(
      '1 prompt · 2 tool calls (1 failed) · 1 subagent · 1 file edited',
    )
  })

  test('formats how long a session ran', () => {
    expect(formatDuration('2026-10-08T10:00:00Z', '2026-10-08T10:00:45Z')).toBe('45s')
    expect(formatDuration('2026-10-08T10:00:00Z', '2026-10-08T10:12:10Z')).toBe('12m')
    expect(formatDuration('2026-10-08T10:00:00Z', '2026-10-08T12:05:00Z')).toBe('2h 5m')
    expect(formatDuration(null, '2026-10-08T12:05:00Z')).toBeNull()
    expect(formatDuration('bad', 'worse')).toBeNull()
  })
})
