import { useCallback } from 'react'
import type { ProjectId } from '@shared/project'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useProjectsStore } from './projectsStore'

/** How many agents and shells a project has open; closing it stops them. */
export function useOpenPaneCount(projectId: ProjectId): number {
  return useWorkspaceStore((state) => state.layouts[projectId]?.panes.length ?? 0)
}

/** Removes a project from Dugout (never its folder), with its panes and editor tabs. */
export function useCloseProject(): (projectId: ProjectId) => Promise<void> {
  const remove = useProjectsStore((state) => state.remove)
  const removeLayout = useWorkspaceStore((state) => state.removeProject)
  const removeEditorTabs = useEditorStore((state) => state.removeProject)
  return useCallback(
    async (projectId) => {
      await remove(projectId)
      removeLayout(projectId)
      removeEditorTabs(projectId)
    },
    [remove, removeLayout, removeEditorTabs],
  )
}
