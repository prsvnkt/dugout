import { constants } from 'node:fs'
import {
  copyFile,
  glob,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import {
  MAX_DIR_ENTRIES,
  MAX_OPEN_FILE_BYTES,
  type DirEntry,
  type FileContent,
  type FileStat,
} from '@shared/files'
import { MAX_COPIED_FILES } from '@shared/worktreeSetup'
import type { GitService } from '../git/GitService'
import { writeFileAtomic } from '../projects/atomicWrite'
import { hashTree } from './hashTree'

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

/** True for `.git` itself and anything in it. */
function isGitDir(path: string): boolean {
  return path.split(sep).includes('.git')
}

/** `path` itself, or its closest ancestor that exists. */
async function nearestExisting(path: string): Promise<string> {
  const exists = await lstat(path).then(
    () => true,
    () => false,
  )
  return exists || dirname(path) === path ? path : nearestExisting(dirname(path))
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/** `path` with symlinks resolved; parts that do not exist yet are kept as they are. */
async function realpathOfNearest(path: string): Promise<string> {
  const exists = await lstat(path).then(
    () => true,
    () => false,
  )
  if (exists) return realpath(path)
  const parent = dirname(path)
  if (parent === path) return path
  return join(await realpathOfNearest(parent), basename(path))
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

  /**
   * Regular files in `root` matching `patterns` (repo-relative globs; folders count with all
   * their files), for copying into a new worktree. Refuses symlinks, anything outside `root`,
   * and more than MAX_COPIED_FILES files.
   */
  async findCopyable(root: string, patterns: readonly string[]): Promise<string[]> {
    const realRoot = await realpath(root)
    const found = new Set<string>()
    const add = (path: string) => {
      found.add(path)
      if (found.size > MAX_COPIED_FILES) {
        throw new Error(
          `Worktree setup matches over ${MAX_COPIED_FILES} files. Copy local files such as .env; ` +
            'install dependencies with the setup command instead.',
        )
      }
    }
    const matches = glob([...patterns], { cwd: realRoot, exclude: (path) => isGitDir(path) })
    for await (const match of matches) {
      const absolute = await this.assertRealInside(realRoot, match)
      const info = await lstat(absolute)
      if (info.isDirectory()) {
        for (const file of await this.filesUnder(realRoot, absolute)) add(file)
      } else if (info.isFile()) {
        add(relative(realRoot, absolute))
      }
    }
    return [...found].sort()
  }

  /**
   * Copies files found by `findCopyable` from one checkout to the same paths in another. Files
   * that already exist there (e.g. tracked ones) are kept. Never writes through a symlink.
   */
  async copyFiles(fromRoot: string, toRoot: string, paths: readonly string[]): Promise<void> {
    const [realFrom, realTo] = await Promise.all([realpath(fromRoot), realpath(toRoot)])
    for (const path of paths) {
      const source = await this.assertRealInside(realFrom, path)
      if (!(await lstat(source)).isFile()) throw new Error(`${path} is not a regular file.`)
      const target = resolve(realTo, path)
      if (!isInside(realTo, target)) throw new Error(`${path} is outside the worktree.`)
      await this.assertRealInside(realTo, await nearestExisting(dirname(target)))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(source, target, constants.COPYFILE_EXCL).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      })
    }
  }

  /** Every regular file under `dir` (repo-relative), refusing symlinks and skipping .git. */
  private async filesUnder(realRoot: string, dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    const files: string[] = []
    for (const entry of entries) {
      const absolute = join(entry.parentPath, entry.name)
      const path = relative(realRoot, absolute)
      if (isGitDir(path)) continue
      if (entry.isSymbolicLink()) throw new Error(`${path} is a symbolic link; it is not copied.`)
      if (entry.isFile()) files.push(path)
    }
    return files
  }

  /** `path` inside `realRoot`, refused if it or any folder on the way is a symlink. */
  private async assertRealInside(realRoot: string, path: string): Promise<string> {
    const candidate = resolve(realRoot, path)
    const shown = relative(realRoot, candidate) || '.'
    if (!isInside(realRoot, candidate)) throw new Error(`${shown} is outside the project.`)
    if ((await realpath(candidate)) !== candidate) {
      throw new Error(`${shown} is a symbolic link (or inside one); it is not copied.`)
    }
    return candidate
  }

  /** Creates or replaces a text file, creating its folders. */
  async writeText(root: string, path: string, content: string): Promise<void> {
    await writeFileAtomic(await this.resolveInside(root, path), content)
  }

  /** Deletes a file; a missing file is fine. */
  async remove(root: string, path: string): Promise<void> {
    await rm(await this.resolveInside(root, path), { force: true })
  }

  /** Names of the files directly in `dir`, or none when it does not exist. */
  async fileNames(root: string, dir: string): Promise<string[]> {
    const absolute = await this.resolveInside(root, dir)
    try {
      const dirents = await readdir(absolute, { withFileTypes: true })
      return dirents.filter((dirent) => dirent.isFile()).map((dirent) => dirent.name)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
  }

  /** Content hash of a file or folder (see `hashTree`), or null when it does not exist. */
  async hashPath(root: string, path: string): Promise<string | null> {
    try {
      return await hashTree(await this.resolveInside(root, path))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  /**
   * Absolute, symlink-resolved path of `path`, which must stay inside `root`. For a path that
   * does not exist yet, its nearest existing folder is resolved, so a write cannot follow a
   * symlinked folder out of the checkout.
   */
  private async resolveInside(root: string, path: string): Promise<string> {
    const realRoot = await realpath(root)
    const candidate = resolve(realRoot, path)
    if (!isInside(realRoot, candidate)) throw new Error(`${path} is outside the project.`)

    const resolved = await realpathOfNearest(candidate)
    if (!isInside(realRoot, resolved)) throw new Error(`${path} is outside the project.`)
    return resolved
  }
}
