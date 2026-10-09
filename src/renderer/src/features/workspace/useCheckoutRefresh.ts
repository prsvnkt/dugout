import { useEffect } from 'react'
import type { ProjectId } from '@shared/project'
import { useSelectedCheckout, useWorkspaceStore } from './workspaceStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useOverlapStore } from '@renderer/features/overlaps/overlapStore'
import { useLiveWorktreeKey } from '@renderer/features/overlaps/useOverlaps'

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
 * Keeps the visible project's selected checkout fresh (git status, file tree, open files) and
 * what each of its worktrees changed (overlap warnings): on show, on a timer while the window is
 * visible, when the window regains focus, and whenever one of its agents changes status.
 */
export function useCheckoutRefresh(projectId: ProjectId, isActive: boolean): void {
  const refreshGit = useGitStore((state) => state.refresh)
  const refreshTree = useExplorerStore((state) => state.refresh)
  const syncWithDisk = useEditorStore((state) => state.syncWithDisk)
  const loadWorktrees = useWorktreeStore((state) => state.load)
  const refreshOverlaps = useOverlapStore((state) => state.refresh)
  const worktreeKey = useLiveWorktreeKey(projectId)
  const checkout = useSelectedCheckout(projectId)
  const activitySignature = useActivitySignature(projectId)

  useEffect(() => {
    if (isActive) void loadWorktrees(projectId)
  }, [isActive, projectId, loadWorktrees])

  useEffect(() => {
    if (!isActive) return
    const refresh = () => {
      void refreshGit(checkout)
      void refreshTree(checkout)
      void syncWithDisk(projectId)
      void refreshOverlaps(projectId, worktreeKey ? worktreeKey.split('\n') : [])
    }
    refresh()
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshIfVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [
    isActive,
    checkout,
    projectId,
    refreshGit,
    refreshTree,
    syncWithDisk,
    refreshOverlaps,
    worktreeKey,
    activitySignature,
  ])
}
