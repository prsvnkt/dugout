import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Folders whose contents never count towards a pinned folder's hash. */
const SKIPPED_DIRS = new Set(['.git', 'node_modules'])
/**
 * A pinned folder is hashed from at most this many files (in sorted path order); more are left
 * out. A file past the cap is invisible: changing, adding or deleting it does not mark the pin
 * "Changed since pinned" (see `docs/known-issues.md`).
 */
export const MAX_HASHED_FILES = 2_000
/** Larger files are hashed by size and modification time instead of their bytes. */
export const MAX_HASHED_FILE_BYTES = 5 * 1024 * 1024

/** How much of a folder is read; injectable so tests need not create thousands of files. */
export interface HashLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
}

const DEFAULT_LIMITS: HashLimits = {
  maxFiles: MAX_HASHED_FILES,
  maxFileBytes: MAX_HASHED_FILE_BYTES,
}

async function fileDigest(path: string, limits: HashLimits): Promise<string> {
  const info = await stat(path)
  if (info.size > limits.maxFileBytes) return `size:${info.size}:${info.mtimeMs}`
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

/** Files under `dir` (relative paths, sorted), skipping `.git` and `node_modules`. */
async function listFiles(
  dir: string,
  limits: HashLimits,
  prefix = '',
  found: string[] = [],
): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true })
  dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const dirent of dirents) {
    if (found.length >= limits.maxFiles) break
    const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name
    if (dirent.isDirectory()) {
      if (!SKIPPED_DIRS.has(dirent.name)) {
        await listFiles(join(dir, dirent.name), limits, relative, found)
      }
    } else if (dirent.isFile()) {
      found.push(relative)
    }
  }
  return found
}

/**
 * A content hash of a file, or of a folder's files (names and contents), so a pinned path can
 * be marked stale when it changes. Symlinks inside folders are not followed.
 */
export async function hashTree(
  absolutePath: string,
  limits: HashLimits = DEFAULT_LIMITS,
): Promise<string> {
  const info = await stat(absolutePath)
  if (!info.isDirectory()) return fileDigest(absolutePath, limits)
  const hash = createHash('sha256')
  for (const file of await listFiles(absolutePath, limits)) {
    hash.update(`${file}\0${await fileDigest(join(absolutePath, file), limits)}\n`)
  }
  return hash.digest('hex')
}
