import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readImportedDoc } from './importDoc'

const dir = mkdtempSync(join(tmpdir(), 'dugout-import-'))

function file(name: string, content: string | Buffer): string {
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

describe('readImportedDoc', () => {
  test('titles a document by its first heading, keeping its file name as the source', async () => {
    const doc = await readImportedDoc(file('spec.md', 'Intro\n# Payments spec\nDetails'))
    expect(doc).toEqual({
      title: 'Payments spec',
      source: 'spec.md',
      body: 'Intro\n# Payments spec\nDetails',
    })
  })

  test('falls back to the file name without its extension', async () => {
    expect((await readImportedDoc(file('notes.txt', 'plain'))).title).toBe('notes')
  })

  test('refuses binary and very large files', async () => {
    await expect(readImportedDoc(file('a.md', Buffer.from([1, 0, 2])))).rejects.toThrow(
      'not a text',
    )
    await expect(readImportedDoc(file('big.md', 'x'.repeat(200_000)))).rejects.toThrow('too large')
  })
})
