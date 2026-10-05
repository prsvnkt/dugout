import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { GitService } from '../git/GitService'
import { FileService } from './FileService'

const files = new FileService({ git: new GitService({ env: process.env }) })

function makeRepo(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-files-')))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  return root
}

describe('FileService.readDir', () => {
  let root: string

  beforeEach(() => {
    root = makeRepo()
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'b.ts'), '')
    writeFileSync(join(root, 'A.md'), '')
    writeFileSync(join(root, 'file10.txt'), '')
    writeFileSync(join(root, 'file2.txt'), '')
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
    writeFileSync(join(root, 'src', 'index.ts'), '')
  })

  test('lists folders first, then files, in natural case-insensitive order', async () => {
    const entries = await files.readDir(root, '')
    expect(entries.map((entry) => entry.name)).toEqual([
      'node_modules',
      'src',
      '.gitignore',
      'A.md',
      'b.ts',
      'file2.txt',
      'file10.txt',
    ])
  })

  test('hides .git and marks ignored entries', async () => {
    const entries = await files.readDir(root, '')
    expect(entries.some((entry) => entry.name === '.git')).toBe(false)
    expect(entries.find((entry) => entry.name === 'node_modules')?.isIgnored).toBe(true)
    expect(entries.find((entry) => entry.name === 'src')?.isIgnored).toBe(false)
  })

  test('lists a subfolder with repo-relative paths', async () => {
    expect(await files.readDir(root, 'src')).toEqual([
      { name: 'index.ts', path: 'src/index.ts', kind: 'file', isIgnored: false },
    ])
  })
})

describe('FileService path safety', () => {
  test('refuses to follow a symlink out of the checkout', async () => {
    const root = makeRepo()
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-outside-')))
    writeFileSync(join(outside, 'secret.txt'), 'top secret')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'))

    await expect(files.readFile(root, 'link.txt')).rejects.toThrow('outside the project')
  })

  test('refuses paths that climb out of the checkout', async () => {
    await expect(files.readFile(makeRepo(), '../etc/passwd')).rejects.toThrow('outside the project')
  })
})

describe('FileService.readFile', () => {
  test('reads text with its modification time', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'a.ts'), 'export const a = 1\n')
    const file = await files.readFile(root, 'a.ts')
    expect(file).toMatchObject({ path: 'a.ts', content: 'export const a = 1\n', isBinary: false })
    expect(file.mtimeMs).toBe(statSync(join(root, 'a.ts')).mtimeMs)
  })

  test('does not return the content of binary or very large files', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'img.bin'), Buffer.from([1, 0, 2]))
    writeFileSync(join(root, 'huge.log'), Buffer.alloc(6 * 1024 * 1024, 97))
    expect(await files.readFile(root, 'img.bin')).toMatchObject({ isBinary: true, content: '' })
    expect(await files.readFile(root, 'huge.log')).toMatchObject({ isTooLarge: true, content: '' })
  })
})

describe('FileService.writeFile', () => {
  test('saves when the file is unchanged since it was opened', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'a.ts'), 'old\n')
    const opened = await files.readFile(root, 'a.ts')

    const saved = await files.writeFile(root, 'a.ts', 'new\n', { expectedMtimeMs: opened.mtimeMs })

    expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe('new\n')
    expect(saved.mtimeMs).toBe(statSync(join(root, 'a.ts')).mtimeMs)
  })

  test('refuses to overwrite a file that changed on disk (e.g. an agent edited it)', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'a.ts'), 'old\n')
    const opened = await files.readFile(root, 'a.ts')
    writeFileSync(join(root, 'a.ts'), 'agent edit\n')
    utimesSync(join(root, 'a.ts'), new Date(), new Date(Date.now() + 5_000))

    await expect(
      files.writeFile(root, 'a.ts', 'mine\n', { expectedMtimeMs: opened.mtimeMs }),
    ).rejects.toThrow('changed on disk')
    await files.writeFile(root, 'a.ts', 'mine\n', { expectedMtimeMs: opened.mtimeMs, force: true })
    expect(readFileSync(join(root, 'a.ts'), 'utf8')).toBe('mine\n')
  })

  test('keeps the file mode, e.g. executable scripts', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'run.sh'), '#!/bin/sh\n')
    chmodSync(join(root, 'run.sh'), 0o755)
    const opened = await files.readFile(root, 'run.sh')

    await files.writeFile(root, 'run.sh', '#!/bin/sh\necho hi\n', {
      expectedMtimeMs: opened.mtimeMs,
    })

    expect(statSync(join(root, 'run.sh')).mode & 0o777).toBe(0o755)
  })
})

describe('FileService.stat', () => {
  test('reports modification times, or null for deleted files', async () => {
    const root = makeRepo()
    writeFileSync(join(root, 'a.ts'), '')
    const stats = await files.stat(root, ['a.ts', 'gone.ts'])
    expect(stats).toEqual([
      { path: 'a.ts', mtimeMs: statSync(join(root, 'a.ts')).mtimeMs },
      { path: 'gone.ts', mtimeMs: null },
    ])
  })
})
