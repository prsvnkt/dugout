import type { GitChangeKind } from './git'

/** What one worktree changed since its branch left the base branch. */
export interface WorktreeChanges {
  readonly worktreePath: string
  readonly changes: readonly { readonly path: string; readonly kind: GitChangeKind }[]
}

/** Two agents' worktrees to compare, e.g. Claude's and Codex's attempts at a task. */
export interface CompareTarget {
  readonly title: string
  readonly sides: readonly [CompareSide, CompareSide]
}

export interface CompareSide {
  readonly label: string
  readonly worktreePath: string
}
