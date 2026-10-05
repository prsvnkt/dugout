import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  MAX_DIR_ENTRIES,
  MAX_OPEN_FILE_BYTES,
  type DirEntry,
  type FileContent,
  type FileStat,
} from '@shared/files'
import type { GitService } from '../git/GitService'
import { writeFileAtomic } from '../projects/atomicWrite'

export interface FileServiceDeps {
  readonly git: GitService
}

export class FileConflictError extends Error {
  override readonly name = 'FileConflictError'
}

const BINARY_SNIFF_BYTES = 8_000
const HIDDEN_ENTRIES = new Set(['.git'])
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep)
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function byKindThenName(a: DirEntry, b: DirEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  return collator.compare(a.name, b.name)
}

/**
 * Reads and writes files inside a checkout for the explorer and editor. Every path is resolved
 * (following symlinks) and must stay inside the checkout.
 */
export class FileService {
  constructor(private readonly deps: FileServiceDeps) {}

  async readDir(root: string, dir: string): Promise<DirEntry[]> {
    const absolute = await this.resolveInside(root, dir)
    const dirents = (await readdir(absolute, { withFileTypes: true }))
      .filter((dirent) => !HIDDEN_ENTRIES.has(dirent.name))
      .slice(0, MAX_DIR_ENTRIES)

    const entries = await Promise.all(
      dirents.map(async (dirent) => {
        const path = dir ? `${dir}/${dirent.name}` : dirent.name
        const isDir =
          dirent.isDirectory() ||
          (dirent.isSymbolicLink() &&
            (await stat(join(absolute, dirent.name)).catch(() => null))?.isDirectory() === true)
        return { name: dirent.name, path, kind: isDir ? 'dir' : 'file' } as const
      }),
    )
    const ignored = await this.deps.git.checkIgnored(
      root,
      entries.map((entry) => entry.path),
    )
    return entries
      .map((entry) => ({ ...entry, isIgnored: ignored.has(entry.path) }))
      .sort(byKindThenName)
  }

  async readFile(root: string, path: string): Promise<FileContent> {
    const absolute = await this.resolveInside(root, path)
    const info = await stat(absolute)
    const base = { path, mtimeMs: info.mtimeMs, content: '' }
    if (info.size > MAX_OPEN_FILE_BYTES) return { ...base, isBinary: false, isTooLarge: true }

    const buffer = await readFile(absolute)
    const isBinary = buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)
    return {
      ...base,
      content: isBinary ? '' : buffer.toString('utf8'),
      isBinary,
      isTooLarge: false,
    }
  }

  async stat(root: string, paths: readonly string[]): Promise<FileStat[]> {
    return Promise.all(
      paths.map(async (path) => {
        try {
          const info = await stat(await this.resolveInside(root, path))
          return { path, mtimeMs: info.mtimeMs }
        } catch (error) {
          if (isMissing(error)) return { path, mtimeMs: null }
          throw error
        }
      }),
    )
  }

  /** Saves a file, refusing if it changed on disk since `expectedMtimeMs` (unless `force`). */
  async writeFile(
    root: string,
    path: string,
    content: string,
    options: { expectedMtimeMs: number | null; force?: boolean | undefined },
  ): Promise<{ mtimeMs: number }> {
    const absolute = await this.resolveInside(root, path)
    const current = await stat(absolute)
    const hasChanged =
      options.expectedMtimeMs !== null && current.mtimeMs !== options.expectedMtimeMs
    if (hasChanged && !options.force) {
      throw new FileConflictError(`${path} changed on disk since it was opened.`)
    }
    await writeFileAtomic(absolute, content, current.mode & 0o777)
    return { mtimeMs: (await stat(absolute)).mtimeMs }
  }

  /** Absolute, symlink-resolved path of `path`, which must stay inside `root`. */
  private async resolveInside(root: string, path: string): Promise<string> {
    const realRoot = await realpath(root)
    const candidate = resolve(realRoot, path)
    if (!isInside(realRoot, candidate)) throw new Error(`${path} is outside the project.`)

    // Resolve symlinks, if the path exists, and re-check where it really points.
    const exists = await lstat(candidate).then(
      () => true,
      () => false,
    )
    const resolved = exists ? await realpath(candidate) : candidate
    if (!isInside(realRoot, resolved)) throw new Error(`${path} is outside the project.`)
    return resolved
  }
}
