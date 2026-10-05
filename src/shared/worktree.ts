/** A git worktree Dugout created for a project, used to isolate one agent session. */
export interface Worktree {
  /** Absolute path of the worktree checkout. */
  readonly path: string
  /** Null when its HEAD is detached. */
  readonly branch: string | null
  /** Short identifier shown in the UI. */
  readonly name: string
}

/** Where a git operation runs: the project's main checkout, or one of its worktrees. */
export interface GitCheckout {
  readonly projectId: string
  readonly worktreePath?: string | undefined
}
