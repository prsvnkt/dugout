import type { Worktree } from './worktree'

/** What the renderer needs to open a Claude pane for a task. */
export interface TaskSession {
  readonly worktree: Worktree
  readonly prompt: string
  readonly task: { readonly number: number; readonly title: string }
}
