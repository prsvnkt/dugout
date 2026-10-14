import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import { createBuffersSlice } from './editorBuffersSlice'
import { createEditorOps } from './editorOps'
import type { EditorState } from './editorState'
import { createTabsSlice } from './editorTabsSlice'
import { EMPTY_TABS, type TabsState } from './tabs'

export {
  tabIdOf,
  type BufferContent,
  type DiffSides,
  type DiskState,
  type FileBuffer,
} from './editorState'

/**
 * Open tabs per project (editorTabsSlice) and the files they show (editorBuffersSlice), sharing
 * the internals in editorOps.
 */
export const useEditorStore = create<EditorState>()((set, get) => {
  const ops = createEditorOps(set, get)
  return {
    tabsByProject: {},
    buffers: {},
    diffs: {},
    pendingClose: {},
    saveErrors: {},
    ...createTabsSlice(set, get, ops),
    ...createBuffersSlice(get, ops),
  }
})

export function useProjectTabs(projectId: ProjectId): TabsState {
  return useEditorStore((state) => state.tabsByProject[projectId] ?? EMPTY_TABS)
}

export function useHasUnsavedChanges(): boolean {
  return useEditorStore((state) => Object.values(state.buffers).some((buffer) => buffer.isDirty))
}
