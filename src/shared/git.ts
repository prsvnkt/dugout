export type GitChangeKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'untracked'
  | 'conflicted'

/** Lines added and removed in one side of a change (`git diff --numstat`). */
export type GitLineStats =
  | { readonly kind: 'text'; readonly additions: number; readonly deletions: number }
  | { readonly kind: 'binary' }

/** One path in `git status`. A file can have both staged and unstaged changes. */
export interface GitFileChange {
  readonly path: string
  /** Previous path, for renames and copies. */
  readonly originalPath?: string
  readonly staged: GitChangeKind | null
  readonly unstaged: GitChangeKind | null
  /** Null when unknown (e.g. a conflict, or an untracked file too large to count). */
  readonly stagedStats?: GitLineStats | null
  readonly unstagedStats?: GitLineStats | null
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

export const MAX_GIT_PATHS_PER_REQUEST = 500
export const MAX_COMMIT_MESSAGE_LENGTH = 10_000

/** The last commit on a branch, as the branch picker shows it. */
export interface GitCommitSummary {
  readonly sha: string
  readonly subject: string
  readonly author: string
  /** ISO 8601 committer date. */
  readonly date: string
}

/**
 * A branch for the branch picker. Remote branches are only listed when there is no local
 * branch of the same name; picking one creates a local branch that tracks it.
 */
export type GitBranch =
  | {
      readonly kind: 'local'
      readonly name: string
      readonly isCurrent: boolean
      /** Another worktree that has it checked out; git refuses to check it out twice. */
      readonly checkedOutAt: string | null
      readonly commit: GitCommitSummary
    }
  | {
      readonly kind: 'remote'
      /** e.g. `origin/feat/x` */
      readonly name: string
      /** The local branch it would create, e.g. `feat/x`. */
      readonly localName: string
      readonly commit: GitCommitSummary
    }

export const MAX_BRANCH_NAME_LENGTH = 250
