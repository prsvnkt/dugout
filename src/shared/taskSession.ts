import type { AgentKind } from './terminal'
import type { Worktree } from './worktree'

/** One agent started on a task, in its own worktree. */
export interface TaskAgentSession {
  readonly agent: AgentKind
  readonly worktree: Worktree
}

/** What the renderer needs to open agent panes for a task. */
export interface TaskSession {
  readonly sessions: readonly TaskAgentSession[]
  readonly prompt: string
  readonly task: { readonly number: number; readonly title: string }
}
