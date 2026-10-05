export type GitChangeKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'untracked'
  | 'conflicted'

/** One path in `git status`. A file can have both staged and unstaged changes. */
export interface GitFileChange {
  readonly path: string
  /** Previous path, for renames and copies. */
  readonly originalPath?: string
  readonly staged: GitChangeKind | null
  readonly unstaged: GitChangeKind | null
}

export interface GitStatus {
  /** Null when HEAD is detached. */
  readonly branch: string | null
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
  /** True before the first commit. */
  readonly isUnborn: boolean
  /** The remote's default branch (from origin/HEAD), or null when unknown. */
  readonly baseBranch: string | null
  readonly files: readonly GitFileChange[]
}

export interface GitDiff {
  readonly path: string
  readonly staged: boolean
  readonly text: string
  readonly isBinary: boolean
  readonly isTruncated: boolean
}

export const MAX_GIT_PATHS_PER_REQUEST = 500
export const MAX_COMMIT_MESSAGE_LENGTH = 10_000
