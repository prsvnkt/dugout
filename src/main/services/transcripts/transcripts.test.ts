import { appendFileSync, copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readClaudeTranscript } from './claudeTranscript'
import { readCodexTranscript } from './codexTranscript'
import { readLinesFrom, splitCompleteLines } from './jsonlTail'

const FIXTURES = join(import.meta.dirname, 'fixtures')

function copyFixture(name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'dugout-transcript-')), name)
  copyFileSync(join(FIXTURES, name), path)
  return path
}

describe('splitCompleteLines', () => {
  test('leaves a last line without its newline for later', () => {
    const { lines, consumed } = splitCompleteLines(Buffer.from('a\nb\npartial'))
    expect(lines).toEqual(['a', 'b'])
    expect(consumed).toBe(4)
  })

  test('returns nothing until a line is complete', () => {
    expect(splitCompleteLines(Buffer.from('partial'))).toEqual({ lines: [], consumed: 0 })
  })

  test('counts bytes, not characters, for multi-byte text', () => {
    const { consumed } = splitCompleteLines(Buffer.from('é\n'))
    expect(consumed).toBe(3)
  })
})

describe('readLinesFrom', () => {
  test('reads complete lines and resumes after them once the partial line is finished', async () => {
    // Arrange
    const path = copyFixture('claude-session.jsonl')

    // Act
    const first = await readLinesFrom(path, 0)
    appendFileSync(path, 'tion_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":9}}}\n')
    const second = await readLinesFrom(path, first.nextOffset)

    // Assert
    expect(first.lines).toHaveLength(10)
    expect(second.lines).toHaveLength(1)
    expect(readClaudeTranscript(second.lines).observations[0]).toMatchObject({ id: 'msg_5' })
  })

  test('reads nothing new at the end of the file', async () => {
    const path = copyFixture('claude-session.jsonl')
    const { nextOffset } = await readLinesFrom(path, 0)
    expect(await readLinesFrom(path, nextOffset)).toEqual({ lines: [], nextOffset })
  })

  test('starts again from the top when the file shrank', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dugout-transcript-')), 'short.jsonl')
    writeFileSync(path, '{"a":1}\n')
    expect(await readLinesFrom(path, 500)).toEqual({ lines: ['{"a":1}'], nextOffset: 8 })
  })
})

describe('readClaudeTranscript', () => {
  async function fixtureLines(): Promise<readonly string[]> {
    return (await readLinesFrom(join(FIXTURES, 'claude-session.jsonl'), 0)).lines
  }

  test('counts a streamed reply once, by its message id', async () => {
    const { observations } = readClaudeTranscript(await fixtureLines())
    expect(observations.filter((o) => o.kind === 'message' && o.id === 'msg_1')).toHaveLength(1)
  })

  test('keeps cache reads and writes apart from input', async () => {
    const [first] = readClaudeTranscript(await fixtureLines()).observations
    expect(first).toEqual({
      kind: 'message',
      id: 'msg_1',
      model: 'claude-opus-5-5',
      at: '2026-10-08T10:00:05.000Z',
      tokens: { input: 10, output: 400, cacheRead: 30000, cacheWrite: 2000, cacheWriteLong: 2000 },
    })
  })

  test('skips unknown entry types, malformed lines and synthetic replies; counts subagents', async () => {
    const ids = readClaudeTranscript(await fixtureLines()).observations.map((o) =>
      o.kind === 'message' ? o.id : o.key,
    )
    expect(ids).toEqual(['msg_1', 'msg_2', 'msg_4'])
  })

  test('reads the context from the last main-conversation reply, not a subagent', async () => {
    const { context } = readClaudeTranscript(await fixtureLines())
    expect(context).toEqual({ tokens: 3 + 32000 + 500, window: null, model: 'claude-opus-5-5' })
  })

  test('finds nothing in a transcript without replies', () => {
    expect(readClaudeTranscript(['{"type":"user"}', ''])).toEqual({
      observations: [],
      context: null,
      carry: {},
    })
  })
})

describe('readCodexTranscript', () => {
  async function fixtureLines(): Promise<readonly string[]> {
    return (await readLinesFrom(join(FIXTURES, 'codex-session.jsonl'), 0)).lines
  }

  test('keeps only the last running total, keyed by the session id', async () => {
    const { observations } = readCodexTranscript(await fixtureLines(), {}, '/file.jsonl')
    expect(observations).toEqual([
      {
        kind: 'cumulative',
        key: 'codex-session-1',
        model: 'gpt-6-astra',
        at: '2026-10-08T12:00:09.000Z',
        tokens: { input: 9000, output: 700, cacheRead: 36000, cacheWrite: 0, cacheWriteLong: 0 },
      },
    ])
  })

  test('reads the context window Codex reports', async () => {
    const { context } = readCodexTranscript(await fixtureLines(), {}, '/file.jsonl')
    expect(context).toEqual({ tokens: 25000, window: 258400, model: 'gpt-6-astra' })
  })

  test('remembers the session and model for later reads of the same file', async () => {
    // Arrange
    const lines = await fixtureLines()
    const { carry } = readCodexTranscript(lines.slice(0, 3), {}, '/file.jsonl')

    // Act
    const later = readCodexTranscript(lines.slice(3), carry, '/file.jsonl')

    // Assert
    expect(later.observations[0]).toMatchObject({ key: 'codex-session-1', model: 'gpt-6-astra' })
  })

  test('falls back to the file as the key when the session was never named', () => {
    const line = JSON.stringify({
      type: 'event_msg',
      payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 5 } } },
    })
    const { observations } = readCodexTranscript([line], {}, '/file.jsonl')
    expect(observations[0]).toMatchObject({ key: '/file.jsonl', model: null })
  })
})
