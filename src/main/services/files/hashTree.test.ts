import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { hashTree, MAX_HASHED_FILE_BYTES, MAX_HASHED_FILES, type HashLimits } from './hashTree'

let scratch: string
let pinned: string

beforeEach(async () => {
  scratch = await realpath(await mkdtemp(join(tmpdir(), 'dugout-hashtree-')))
  pinned = join(scratch, 'pinned')
  await mkdir(pinned)
})

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true })
})

async function put(relative: string, contents: string, root = pinned): Promise<string> {
  const path = join(root, relative)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
  return path
}

describe('hashTree', () => {
  test('hashes a single file by its contents', async () => {
    const path = await put('a.txt', 'one')

    expect(await hashTree(path)).toBe(createHash('sha256').update('one').digest('hex'))
  })

  test('changes when a file in the folder changes or is added', async () => {
    await put('src/a.txt', 'one')
    const before = await hashTree(pinned)

    await put('src/a.txt', 'two')
    const edited = await hashTree(pinned)
    await put('src/b.txt', 'new')
    const added = await hashTree(pinned)

    expect(new Set([before, edited, added]).size).toBe(3)
    expect(await hashTree(pinned)).toBe(added)
  })

  test.each(['.git', 'node_modules', 'packages/web/node_modules'])(
    'ignores everything under %s',
    async (skipped) => {
      await put('a.txt', 'one')
      await put(`${skipped}/inner/file.txt`, 'v1')
      const before = await hashTree(pinned)

      await put(`${skipped}/inner/file.txt`, 'v2')
      await put(`${skipped}/other.txt`, 'new')

      expect(await hashTree(pinned)).toBe(before)
    },
  )

  test('does not follow symlinks inside the folder', async () => {
    await put('a.txt', 'one')
    const before = await hashTree(pinned)
    const outside = join(scratch, 'outside')
    const outsideFile = await put('secret.txt', 'v1', outside)
    await symlink(outsideFile, join(pinned, 'link-to-file'))
    await symlink(outside, join(pinned, 'link-to-dir'))

    const linked = await hashTree(pinned)
    await put('secret.txt', 'v2', outside)
    await put('more.txt', 'new', outside)

    expect(linked).toBe(before)
    expect(await hashTree(pinned)).toBe(before)
  })
})

describe('hashTree limits', () => {
  const small: HashLimits = { maxFiles: MAX_HASHED_FILES, maxFileBytes: 10 }
  const mtime = new Date('2026-10-01T00:00:00Z')

  test('defaults to 2,000 files and 5 MB', () => {
    expect(MAX_HASHED_FILES).toBe(2_000)
    expect(MAX_HASHED_FILE_BYTES).toBe(5 * 1024 * 1024)
  })

  test('hashes a file over the size limit by size and modification time only', async () => {
    const path = await put('big.bin', 'a'.repeat(20))
    await utimes(path, mtime, mtime)
    const before = await hashTree(pinned, small)

    await put('big.bin', 'b'.repeat(20))
    await utimes(path, mtime, mtime)
    const sameSizeAndTime = await hashTree(pinned, small)
    await utimes(path, mtime, new Date('2026-10-02T00:00:00Z'))

    expect(sameSizeAndTime).toBe(before)
    expect(await hashTree(pinned, small)).not.toBe(before)
  })

  test('hashes a file at the size limit by its contents', async () => {
    const path = await put('edge.bin', '0123456789')
    await utimes(path, mtime, mtime)
    const before = await hashTree(pinned, small)

    await put('edge.bin', '9876543210')
    await utimes(path, mtime, mtime)

    expect(await hashTree(pinned, small)).not.toBe(before)
  })

  test('leaves out files past the cap, in sorted path order', async () => {
    const capped: HashLimits = { maxFiles: 2, maxFileBytes: MAX_HASHED_FILE_BYTES }
    await put('a/1.txt', 'one')
    await put('a/2.txt', 'two')
    await put('b/3.txt', 'three')
    const before = await hashTree(pinned, capped)

    await put('b/3.txt', 'changed past the cap')
    await put('c.txt', 'added past the cap')
    const pastCap = await hashTree(pinned, capped)
    await put('a/2.txt', 'changed within the cap')

    expect(pastCap).toBe(before)
    expect(await hashTree(pinned, capped)).not.toBe(before)
  })

  test('rejects a path that does not exist', async () => {
    await expect(hashTree(join(scratch, 'missing'))).rejects.toThrow()
  })
})
