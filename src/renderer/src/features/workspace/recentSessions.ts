import { MAX_RECENT_SESSIONS, type SavedRecentSession } from '@shared/ipc/contract'
import { isAgentKind } from '@shared/terminal'
import type { Pane } from './layout'

export { MAX_RECENT_SESSIONS }

/** An agent session closed from a project, which its start screen offers to resume. */
export type RecentSession = SavedRecentSession

const MAX_TITLE_LENGTH = 80

/** What a closed pane leaves behind; null for shells and agents that never started a session. */
export function toRecentSession(pane: Pane, now: number): RecentSession | null {
  if (!isAgentKind(pane.kind) || !pane.sessionId) return null
  return {
    kind: pane.kind,
    sessionId: pane.sessionId,
    closedAt: now,
    ...(pane.title && { title: pane.title }),
    ...(pane.task && { task: pane.task }),
    ...(pane.worktree && { worktree: pane.worktree }),
  }
}

/** Newest first, each session once, at most `MAX_RECENT_SESSIONS`. */
export function rememberSession(
  list: readonly RecentSession[],
  entry: RecentSession,
): readonly RecentSession[] {
  const others = list.filter((existing) => existing.sessionId !== entry.sessionId)
  return [entry, ...others].slice(0, MAX_RECENT_SESSIONS)
}

function without(
  list: readonly RecentSession[],
  isRemoved: (entry: RecentSession) => boolean,
): readonly RecentSession[] {
  return list.some(isRemoved) ? list.filter((entry) => !isRemoved(entry)) : list
}

export function forgetSession(
  list: readonly RecentSession[],
  sessionId: string,
): readonly RecentSession[] {
  return without(list, (entry) => entry.sessionId === sessionId)
}

/** Sessions in a removed worktree cannot be resumed: their folder is gone. */
export function forgetWorktreeSessions(
  list: readonly RecentSession[],
  worktreePath: string,
): readonly RecentSession[] {
  return without(list, (entry) => entry.worktree?.path === worktreePath)
}

/** A short label for a session started from a prompt: its first line, shortened. */
export function titleFromPrompt(prompt: string): string {
  const line = prompt
    .split('\n')
    .map((text) => text.trim())
    .find((text) => text.length > 0)
  const title = line ?? prompt.trim()
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title
}
