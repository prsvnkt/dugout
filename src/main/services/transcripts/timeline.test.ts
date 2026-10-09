import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readClaudeTimeline } from './claudeTimeline'
import { readCodexTimeline } from './codexTimeline'
import {
  buildTimeline,
  displayPath,
  patchedFiles,
  shorten,
  TIMELINE_LIMITS,
  type TimelineStep,
} from './timelineSteps'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const fixtureLines = (name: string) => readFileSync(join(FIXTURES, name), 'utf8').split('\n')

describe('Claude timeline', () => {
  const timeline = () => buildTimeline(readClaudeTimeline(fixtureLines('claude-timeline.jsonl')))

  test('lists prompts, text, tool calls and subagents in order, each once', () => {
    const { events } = timeline()
    expect(events.map((event) => (event.kind === 'tool' ? event.name : event.kind))).toEqual([
      'prompt',
      'message',
      'Read',
      'Bash',
      'Edit',
      'subagent',
      'prompt',
      'Write',
      'message',
    ])
  })

  test('gives each call its main argument and the outcome of its result', () => {
    const tools = timeline().events.flatMap((event) => (event.kind === 'tool' ? [event] : []))
    expect(tools.map(({ detail, outcome }) => ({ detail, outcome }))).toEqual([
      { detail: 'src/login.ts', outcome: 'ok' },
      { detail: 'npm test -- login', outcome: 'failed' },
      { detail: 'src/login.ts', outcome: 'ok' },
      { detail: '/elsewhere/notes.md', outcome: 'pending' },
    ])
  })

  test('shows Agent calls as subagents with their type and task', () => {
    const subagent = timeline().events.find((event) => event.kind === 'subagent')
    expect(subagent).toMatchObject({
      agentType: 'code-reviewer',
      detail: 'Review the fix',
      outcome: 'ok',
    })
  })

  test('reads slash commands as typed, and skips meta lines and subagent internals', () => {
    const prompts = timeline().events.flatMap((event) => (event.kind === 'prompt' ? [event] : []))
    expect(prompts.map((prompt) => prompt.text)).toEqual(['Fix the login bug', '/review 12'])
    expect(JSON.stringify(timeline().events)).not.toContain('toolu_sub')
  })

  test('collects touched files, an edit outranking a read, relative to the session folder', () => {
    expect(timeline().files).toEqual([
      { path: 'src/login.ts', change: 'edited' },
      { path: '/elsewhere/notes.md', change: 'edited' },
    ])
  })

  test('ends with the last thing the agent said, and the span of the session', () => {
    const { finalMessage, startedAt, endedAt, isTruncated } = timeline()
    expect(finalMessage).toBe('Fixed the login bug; tests pass.')
    expect(startedAt).toBe('2026-10-08T10:00:00.000Z')
    expect(endedAt).toBe('2026-10-08T10:02:10.000Z')
    expect(isTruncated).toBe(false)
  })
})

describe('Codex timeline', () => {
  const timeline = () => buildTimeline(readCodexTimeline(fixtureLines('codex-timeline.jsonl')))

  test('lists prompts (not injected context), messages, calls and subagents', () => {
    const kinds = timeline().events.map((event) =>
      event.kind === 'tool' ? event.name : event.kind,
    )
    expect(kinds).toEqual([
      'prompt',
      'message',
      'shell',
      'apply_patch',
      'subagent',
      'exec_command',
      'message',
      'prompt',
    ])
    expect(timeline().events[0]).toMatchObject({ text: 'Fix the login bug' })
    expect(timeline().events.at(-1)).toMatchObject({ text: 'Now update the docs' })
  })

  test('reads failures from exit codes in the call output', () => {
    const tools = timeline().events.flatMap((event) => (event.kind === 'tool' ? [event] : []))
    expect(tools.map(({ detail, outcome }) => ({ detail, outcome }))).toEqual([
      { detail: 'bash -lc npm test', outcome: 'failed' },
      { detail: 'src/login.ts, docs/login.md', outcome: 'ok' },
      { detail: 'npm test', outcome: 'ok' },
    ])
  })

  test('finds the files apply_patch changed, and spawn_agent subagents', () => {
    const { files, events } = timeline()
    expect(files).toEqual([
      { path: 'src/login.ts', change: 'edited' },
      { path: 'docs/login.md', change: 'edited' },
    ])
    expect(events.find((event) => event.kind === 'subagent')).toMatchObject({
      detail: 'review_login',
      outcome: 'ok',
    })
  })

  test("takes the final message from Codex's own task_complete record", () => {
    expect(timeline().finalMessage).toBe('Fixed the login bug; tests pass.')
  })
})

describe('buildTimeline', () => {
  const call = (id: string, path: string): TimelineStep => ({
    kind: 'call',
    at: '2026-10-08T10:00:00.000Z',
    id,
    name: 'Edit',
    detail: path,
    subagent: null,
    files: [{ path, change: 'edited' }],
  })

  test('keeps the most recent events of a long session and says it left some out', () => {
    // Arrange
    const steps = Array.from({ length: TIMELINE_LIMITS.events + 5 }, (_, i) => call(`t${i}`, 'a'))

    // Act
    const { events, isTruncated } = buildTimeline(steps)

    // Assert
    expect(events).toHaveLength(TIMELINE_LIMITS.events)
    expect(events[0]).toMatchObject({ id: 't5' })
    expect(isTruncated).toBe(true)
  })

  test('caps the files list, keeping the most recently touched', () => {
    const steps = Array.from({ length: TIMELINE_LIMITS.files + 1 }, (_, i) =>
      call(`t${i}`, `f${i}`),
    )
    const { files, isTruncated } = buildTimeline(steps)
    expect(files).toHaveLength(TIMELINE_LIMITS.files)
    expect(files[0]?.path).toBe('f1')
    expect(isTruncated).toBe(true)
  })

  test('shortens long prompts and messages', () => {
    const text = 'x'.repeat(TIMELINE_LIMITS.text + 50)
    const { events, finalMessage } = buildTimeline([
      { kind: 'prompt', at: '', text },
      { kind: 'message', at: '', text, key: 'm' },
    ])
    expect(
      events.every((event) => 'text' in event && event.text.length === TIMELINE_LIMITS.text),
    ).toBe(true)
    expect(finalMessage).toBe(text)
  })

  test('is empty for a transcript with nothing it understands', () => {
    expect(buildTimeline([])).toEqual({
      events: [],
      files: [],
      finalMessage: null,
      startedAt: null,
      endedAt: null,
      isTruncated: false,
    })
  })
})

describe('timeline helpers', () => {
  test('shows paths inside the session folder relative to it, others as they are', () => {
    expect(displayPath('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
    expect(displayPath('/repo-other/a.ts', '/repo')).toBe('/repo-other/a.ts')
    expect(displayPath('src/a.ts', '/repo')).toBe('src/a.ts')
    expect(displayPath('/repo/a.ts', null)).toBe('/repo/a.ts')
  })

  test('reads added, updated, deleted and moved files from a patch', () => {
    const patch =
      '*** Update File: a.ts\n*** Move to: b.ts\n*** Delete File: c.ts\n*** Add File: a.ts'
    expect(patchedFiles(patch)).toEqual(['a.ts', 'c.ts', 'b.ts'])
  })

  test('shortens with an ellipsis only when needed', () => {
    expect(shorten('  short  ', 10)).toBe('short')
    expect(shorten('abcdefghij', 5)).toBe('abcd…')
  })
})
