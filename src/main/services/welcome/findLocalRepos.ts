import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { LocalRepo, RepoSearchScope } from '@shared/welcome'

/** Repos sit directly in a code folder or one level down (e.g. ~/Developer/org/repo). */
const MAX_DEPTH = 2
const MAX_REPOS = 30

/** Folders people keep code in, relative to the home folder. */
const COMMON_FOLDERS = [
  'Developer',
  'code',
  'Code',
  'dev',
  'Projects',
  'projects',
  'src',
  'repos',
  'Repos',
  'git',
  'GitHub',
  'workspace',
  'Sites',
]
/** Protected by macOS privacy controls: reading them shows a permission prompt. */
const PROTECTED_FOLDERS = ['Documents', 'Desktop']
const SKIPPED_NAMES = new Set(['node_modules', 'Library', 'Applications', 'Downloads'])

export interface RepoSearch {
  readonly homeDir: string
  /** The folder clones go into, when the user picked one. */
  readonly cloneParentDir?: string | undefined
}

/** The folders to search for a scope. Never the home folder itself (it holds protected ones). */
export function searchRoots(scope: RepoSearchScope, search: RepoSearch): string[] {
  if (scope === 'documents') return PROTECTED_FOLDERS.map((name) => join(search.homeDir, name))
  const roots = COMMON_FOLDERS.map((name) => join(search.homeDir, name))
  const clone = search.cloneParentDir
  return clone && clone !== search.homeDir ? [clone, ...roots] : roots
}

/** Git repositories under `roots`, most recently changed first. Missing roots are skipped. */
export async function findLocalRepos(roots: readonly string[]): Promise<LocalRepo[]> {
  const found = new Map<string, LocalRepo>()
  const seenRoots = new Set<string>()
  for (const root of roots) {
    const id = await folderId(root)
    // ~/code and ~/Code are the same folder on a case-insensitive disk.
    if (id === null || seenRoots.has(id)) continue
    seenRoots.add(id)
    await collect(root, 1, found)
  }
  return [...found.values()].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, MAX_REPOS)
}

async function collect(dir: string, depth: number, found: Map<string, LocalRepo>): Promise<void> {
  for (const entry of await subfolders(dir)) {
    const path = join(dir, entry.name)
    // A folder for a clone, a file for a worktree.
    const gitStat = await stat(join(path, '.git')).catch(() => null)
    if (gitStat) {
      const id = await folderId(path)
      if (id !== null && !found.has(id)) {
        found.set(id, { name: basename(path), path, modifiedAt: gitStat.mtimeMs })
      }
    } else if (depth < MAX_DEPTH) {
      await collect(path, depth + 1, found)
    }
  }
}

/** Real (non-symlink), visible subfolders; an unreadable folder has none. */
async function subfolders(dir: string): Promise<Dirent[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_NAMES.has(entry.name),
  )
}

async function folderId(path: string): Promise<string | null> {
  const stats = await stat(path).catch(() => null)
  return stats?.isDirectory() ? `${stats.dev}:${stats.ino}` : null
}
