import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  allowedPath,
  findClaudeTranscript,
  findCodexTranscript,
  readTranscriptTail,
} from './transcriptFiles'

const tempDir = (prefix: string) => mkdtempSync(join(tmpdir(), prefix))

function writeAt(root: string, parts: readonly string[], content = '{}\n'): string {
  const path = join(root, ...parts)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  return path
}

describe('allowedPath', () => {
  test('accepts only .jsonl files that really are inside the root', async () => {
    const root = tempDir('dugout-root-')
    const inside = join(root, 'a.jsonl')
    writeFileSync(inside, '')
    expect(await allowedPath(inside, root)).toMatch(/a\.jsonl$/)
    expect(await allowedPath(join(root, '..', 'x.jsonl'), root)).toBeNull()
    expect(await allowedPath(join(root, 'missing.jsonl'), root)).toBeNull()
    expect(await allowedPath('relative.jsonl', root)).toBeNull()
    expect(await allowedPath(join(root, 'a.txt'), root)).toBeNull()
  })

  test('refuses a symlink inside the root that points outside it', async () => {
    const root = tempDir('dugout-root-')
    const outside = writeAt(tempDir('dugout-outside-'), ['secret.jsonl'])
    symlinkSync(outside, join(root, 'link.jsonl'))
    expect(await allowedPath(join(root, 'link.jsonl'), root)).toBeNull()
  })
})

describe('findClaudeTranscript', () => {
  test('finds a session in any project folder by its id', async () => {
    const root = tempDir('dugout-claude-')
    const path = writeAt(root, ['projects', '-Users-me-app', 'abc-123.jsonl'])
    expect(await findClaudeTranscript(root, 'abc-123')).toBe(path)
  })

  test('finds nothing for an unknown session, a missing folder or an unsafe id', async () => {
    const root = tempDir('dugout-claude-')
    writeAt(root, ['projects', 'p', 'abc.jsonl'])
    expect(await findClaudeTranscript(root, 'other')).toBeNull()
    expect(await findClaudeTranscript(join(root, 'missing'), 'abc')).toBeNull()
    expect(await findClaudeTranscript(root, '../p/abc')).toBeNull()
  })
})

describe('findCodexTranscript', () => {
  test('finds a rollout file by the session id at the end of its name, in dated folders', async () => {
    const root = tempDir('dugout-codex-')
    writeAt(root, ['sessions', '2026', '10', '07', 'rollout-2026-10-07T09-00-00-other.jsonl'])
    const path = writeAt(root, [
      'sessions',
      '2026',
      '10',
      '08',
      'rollout-2026-10-08T12-00-00-s-9.jsonl',
    ])
    expect(await findCodexTranscript(root, 's-9')).toBe(path)
  })

  test('finds nothing for an unknown session or an unsafe id', async () => {
    const root = tempDir('dugout-codex-')
    writeAt(root, ['sessions', 'rollout-s-1.jsonl'])
    expect(await findCodexTranscript(root, 'nope')).toBeNull()
    expect(await findCodexTranscript(root, '*')).toBeNull()
  })
})

describe('readTranscriptTail', () => {
  test('reads a small transcript whole', async () => {
    const path = writeAt(tempDir('dugout-tail-'), ['t.jsonl'], 'one\ntwo\n')
    expect(await readTranscriptTail(path, 1024)).toEqual({ lines: ['one', 'two'], isCut: false })
  })

  test('reads only the end of a long one, without its cut first line', async () => {
    const path = writeAt(tempDir('dugout-tail-'), ['t.jsonl'], 'first line\nsecond\nthird\n')
    expect(await readTranscriptTail(path, 10)).toEqual({ lines: ['third'], isCut: true })
  })
})
