import { lstat, readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { GitLineStats } from '@shared/git'
import { countLines } from './lineStats'

/** Status is polled; counting stays cheap by skipping big files and long untracked lists. */
export const MAX_UNTRACKED_FILES_COUNTED = 200
export const MAX_UNTRACKED_BYTES_COUNTED = 1024 * 1024

async function statsFor(root: string, path: string): Promise<GitLineStats | null> {
  const absolute = resolve(root, path)
  if (!absolute.startsWith(root + sep)) return null
  try {
    // lstat: a symlink is never followed, so nothing outside the checkout is read.
    const info = await lstat(absolute)
    if (!info.isFile() || info.size > MAX_UNTRACKED_BYTES_COUNTED) return null
    return countLines(await readFile(absolute))
  } catch (error) {
    // The file can vanish between `git status` and the read; its stats are then unknown.
    console.warn('[git] could not count lines of an untracked file', path, error)
    return null
  }
}

/** Line counts of untracked files (all added), for the first files git listed. */
export async function untrackedLineStats(
  root: string,
  paths: readonly string[],
): Promise<Map<string, GitLineStats>> {
  const counted = paths.slice(0, MAX_UNTRACKED_FILES_COUNTED)
  const stats = await Promise.all(counted.map((path) => statsFor(root, path)))
  const result = new Map<string, GitLineStats>()
  counted.forEach((path, index) => {
    const stat = stats[index]
    if (stat) result.set(path, stat)
  })
  return result
}
