import type { GitFileChange, GitLineStats } from '@shared/git'

export type LineStatsByPath = ReadonlyMap<string, GitLineStats>

const BINARY: GitLineStats = { kind: 'binary' }
/** Git's own heuristic: a NUL byte in the first 8000 bytes means binary. */
const BINARY_SNIFF_BYTES = 8000
const NEWLINE = 0x0a

function toStats(added: string, deleted: string): GitLineStats {
  if (added === '-' || deleted === '-') return BINARY
  return { kind: 'text', additions: Number(added), deletions: Number(deleted) }
}

/**
 * Parses `git diff --numstat -z`: `added\tdeleted\tpath\0`, or for a rename
 * `added\tdeleted\t\0old\0new\0`. Renames are keyed by their new path, as `git status` lists them.
 */
export function parseNumstat(stdout: string): Map<string, GitLineStats> {
  const fields = stdout.split('\0')
  const stats = new Map<string, GitLineStats>()
  for (let index = 0; index < fields.length; index++) {
    const [added, deleted, path] = (fields[index] ?? '').split('\t')
    if (added === undefined || deleted === undefined || path === undefined) continue
    if (path !== '') {
      stats.set(path, toStats(added, deleted))
      continue
    }
    const newPath = fields[index + 2]
    index += 2
    if (newPath) stats.set(newPath, toStats(added, deleted))
  }
  return stats
}

/** An untracked file counts as all lines added. */
export function countLines(content: Uint8Array): GitLineStats {
  if (content.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return BINARY
  let lines = 0
  for (const byte of content) if (byte === NEWLINE) lines++
  const hasUnterminatedLastLine = content.length > 0 && content[content.length - 1] !== NEWLINE
  return { kind: 'text', additions: lines + (hasUnterminatedLastLine ? 1 : 0), deletions: 0 }
}

export interface LineStatsSources {
  /** `git diff --cached --numstat`: index vs HEAD. */
  readonly staged: LineStatsByPath
  /** `git diff --numstat`: working tree vs index. */
  readonly unstaged: LineStatsByPath
  /** Counted lines of untracked files. */
  readonly untracked: LineStatsByPath
}

/** Returns new file changes with each side's line stats attached (null when unknown). */
export function withLineStats(
  files: readonly GitFileChange[],
  sources: LineStatsSources,
): GitFileChange[] {
  return files.map((file) => ({
    ...file,
    stagedStats: file.staged ? (sources.staged.get(file.path) ?? null) : null,
    unstagedStats:
      file.unstaged === 'untracked'
        ? (sources.untracked.get(file.path) ?? null)
        : file.unstaged
          ? (sources.unstaged.get(file.path) ?? null)
          : null,
  }))
}
