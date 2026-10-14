import type { WorkspaceSnapshot } from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import type { Pane, PaneId, ProjectLayout } from './layout'
import type { RecentSession } from './recentSessions'
import { NO_RECENT } from './workspaceState'

type Layouts = Readonly<Record<ProjectId, ProjectLayout>>
type RecentByProject = Readonly<Record<ProjectId, readonly RecentSession[]>>

/** Saved panes back as layouts with fresh pane ids (the last pane focused), and closed sessions. */
export function fromSnapshot(
  snapshot: WorkspaceSnapshot,
  createPaneId: () => PaneId,
): { layouts: Layouts; recentSessions: RecentByProject } {
  const saved = Object.entries(snapshot.projects)
  const layouts = saved.map(([projectId, project]) => {
    const panes = project.panes.map(({ kind, worktree, sessionId, title }): Pane => ({
      id: createPaneId(),
      kind,
      generation: 0,
      ...(worktree && { worktree }),
      ...(sessionId && { sessionId }),
      ...(title && { title }),
    }))
    return [projectId, { panes, focusedPaneId: panes.at(-1)?.id ?? null }] as const
  })
  return {
    layouts: Object.fromEntries(layouts),
    recentSessions: Object.fromEntries(
      saved.map(([projectId, project]) => [projectId, project.recent ?? NO_RECENT]),
    ),
  }
}

/**
 * The persistable part of the workspace: each project's panes, without runtime ids, and the
 * agent sessions closed from it.
 */
export function toSnapshot(
  layouts: Layouts,
  recentSessions: RecentByProject = {},
): WorkspaceSnapshot {
  const projectIds = [...new Set([...Object.keys(layouts), ...Object.keys(recentSessions)])]
  return {
    version: 1,
    projects: Object.fromEntries(
      projectIds.map((projectId) => {
        const panes = layouts[projectId]?.panes ?? []
        const recent = recentSessions[projectId] ?? NO_RECENT
        return [
          projectId,
          {
            panes: panes.map(({ kind, worktree, sessionId, task, title }) => ({
              kind,
              ...(worktree && { worktree }),
              ...(sessionId && { sessionId }),
              ...(task && { task }),
              ...(title && { title }),
            })),
            ...(recent.length > 0 && { recent: [...recent] }),
          },
        ]
      }),
    ),
  }
}
