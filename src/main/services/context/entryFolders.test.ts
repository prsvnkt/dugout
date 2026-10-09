import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { FileService } from '../files/FileService'
import { GitService } from '../git/GitService'
import { checkoutFolder, diskFolder } from './entryFolders'

const tempDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'dugout-context-')))

describe.each([
  ['app data', () => diskFolder(join(tempDir(), 'context', 'p1'))],
  [
    'checkout',
    () => {
      const root = tempDir()
      execFileSync('git', ['init', '-q'], { cwd: root })
      return checkoutFolder(
        new FileService({ git: new GitService({ env: process.env }) }),
        root,
        '.dugout/context',
      )
    },
  ],
])('%s entry folder', (_name, makeFolder) => {
  test('is empty before anything is written, then lists, reads and removes files', async () => {
    const folder = makeFolder()
    expect(await folder.names()).toEqual([])
    expect(await folder.read('a.md')).toBeNull()

    await folder.write('a.md', 'hello')

    expect(await folder.names()).toEqual(['a.md'])
    expect((await folder.read('a.md'))?.content).toBe('hello')
    await folder.remove('a.md')
    expect(await folder.names()).toEqual([])
  })
})

test('private entries are readable by the user only', async () => {
  const dir = join(tempDir(), 'p1')
  await diskFolder(dir).write('a.md', 'secret')
  expect(statSync(join(dir, 'a.md')).mode & 0o777).toBe(0o600)
})
