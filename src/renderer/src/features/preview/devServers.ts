import type { ProjectId } from '@shared/project'
import type { Pane, ProjectLayout } from '@renderer/features/workspace/layout'

/** The open dev server shell of a checkout (a worktree path, or null for the main checkout). */
export function devServerPane(
  layout: ProjectLayout | undefined,
  worktreePath: string | null,
): Pane | null {
  return (
    layout?.panes.find(
      (pane) => pane.devServer !== undefined && (pane.worktree?.path ?? null) === worktreePath,
    ) ?? null
  )
}

/** Ports given to open dev server shells in every project, which a new one must not reuse. */
export function reservedPorts(layouts: Readonly<Record<ProjectId, ProjectLayout>>): number[] {
  return Object.values(layouts).flatMap((layout) =>
    layout.panes.flatMap((pane) => (pane.devServer ? [pane.devServer.port] : [])),
  )
}
