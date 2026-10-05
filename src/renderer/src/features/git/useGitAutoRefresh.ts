import { useEffect } from 'react'
import type { ProjectId } from '@shared/project'
import { useSelectedCheckout, useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useGitStore } from './gitStore'

const REFRESH_INTERVAL_MS = 3_000

/** A string that changes whenever any of the project's panes changes activity. */
function useActivitySignature(projectId: ProjectId): string {
  return useWorkspaceStore((state) =>
    (state.layouts[projectId]?.panes ?? [])
      .map((pane) => state.activities[pane.id] ?? '')
      .join(','),
  )
}

/**
 * Keeps the visible project's selected checkout fresh: on show, on a timer while the window is
 * visible, when the window regains focus, and whenever one of its agents changes status.
 */
export function useGitAutoRefresh(projectId: ProjectId, isActive: boolean): void {
  const refresh = useGitStore((state) => state.refresh)
  const loadWorktrees = useWorktreeStore((state) => state.load)
  const checkout = useSelectedCheckout(projectId)
  const activitySignature = useActivitySignature(projectId)

  useEffect(() => {
    if (isActive) void loadWorktrees(projectId)
  }, [isActive, projectId, loadWorktrees])

  useEffect(() => {
    if (!isActive) return
    void refresh(checkout)
  }, [isActive, checkout, refresh, activitySignature])

  useEffect(() => {
    if (!isActive) return
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh(checkout)
    }
    const timer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshIfVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [isActive, checkout, refresh])
}
