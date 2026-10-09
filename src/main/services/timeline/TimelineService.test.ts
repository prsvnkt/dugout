import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { timelineSources } from './setupTimeline'
import { TimelineService } from './TimelineService'

const FIXTURES = join(import.meta.dirname, '..', 'transcripts', 'fixtures')

/** A stand-in for ~/.claude and ~/.codex holding one session each, from the fixtures. */
function setup(options: { maxBytes?: number } = {}) {
  const claudeDir = mkdtempSync(join(tmpdir(), 'dugout-claude-'))
  const codexDir = mkdtempSync(join(tmpdir(), 'dugout-codex-'))
  mkdirSync(join(claudeDir, 'projects', '-repo'), { recursive: true })
  copyFileSync(
    join(FIXTURES, 'claude-timeline.jsonl'),
    join(claudeDir, 'projects', '-repo', 's-2.jsonl'),
  )
  const day = join(codexDir, 'sessions', '2026', '10', '08')
  mkdirSync(day, { recursive: true })
  copyFileSync(join(FIXTURES, 'codex-timeline.jsonl'), join(day, 'rollout-2026-10-08-c-2.jsonl'))
  const sources = timelineSources('/home/nobody', {
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: codexDir,
  })
  return { service: new TimelineService({ sources, ...options }), claudeDir }
}

describe('TimelineService', () => {
  test("builds a Claude session's timeline from its transcript", async () => {
    const timeline = await setup().service.timeline('claude', 's-2')
    expect(timeline).toMatchObject({
      agent: 'claude',
      sessionId: 's-2',
      finalMessage: 'Fixed the login bug; tests pass.',
      isTruncated: false,
    })
    expect(timeline.events).toHaveLength(9)
  })

  test("builds a Codex session's timeline from its rollout log", async () => {
    const timeline = await setup().service.timeline('codex', 'c-2')
    expect(timeline.files.map((file) => file.path)).toEqual(['src/login.ts', 'docs/login.md'])
  })

  test('says so when the session has no transcript yet', async () => {
    await expect(setup().service.timeline('claude', 'missing')).rejects.toThrow(/No transcript/)
  })

  test('refuses agents without a timeline', async () => {
    await expect(setup().service.timeline('opencode', 's-2')).rejects.toThrow(/no timeline/)
  })

  test('never reads a transcript that links outside the agent folder', async () => {
    // Arrange
    const { service, claudeDir } = setup()
    const outside = mkdtempSync(join(tmpdir(), 'dugout-outside-'))
    copyFileSync(join(FIXTURES, 'claude-timeline.jsonl'), join(outside, 'x.jsonl'))
    symlinkSync(join(outside, 'x.jsonl'), join(claudeDir, 'projects', '-repo', 'linked.jsonl'))

    // Act / Assert
    await expect(service.timeline('claude', 'linked')).rejects.toThrow(/No transcript/)
  })

  test('reads only the end of a transcript over the size cap, and says so', async () => {
    const timeline = await setup({ maxBytes: 600 }).service.timeline('claude', 's-2')
    expect(timeline.isTruncated).toBe(true)
    expect(timeline.finalMessage).toBe('Fixed the login bug; tests pass.')
    expect(timeline.events.some((event) => event.kind === 'prompt')).toBe(false)
  })
})
