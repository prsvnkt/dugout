import type { FileContent, RevisionContent } from '@shared/files'
import type { ProjectId } from '@shared/project'
import type { Result } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { editorBridge } from './editorBridge'
import {
  contentOf,
  type DiffSides,
  type EditorGet,
  type EditorSet,
  type FileBuffer,
} from './editorState'
import { checkoutOf, fileKeyOf } from './fileKey'
import { closeTab, EMPTY_TABS, type TabsState } from './tabs'

/** Store internals both slices share; not part of the store's public state. */
export interface EditorOps {
  tabsOf(projectId: ProjectId): TabsState
  /** Applies a tabs transition; an unchanged result leaves the state object as it was. */
  setTabs(projectId: ProjectId, change: (tabs: TabsState) => TabsState): void
  patchBuffer(fileKey: string, change: Partial<FileBuffer>): void
  setSaveError(fileKey: string, error: string | null): void
  loadFile(checkout: GitCheckout, path: string): Promise<void>
  ensureFile(checkout: GitCheckout, path: string): Promise<void>
  loadDiff(tabId: string, checkout: GitCheckout, path: string, staged: boolean): Promise<void>
  /** Drops buffers and models that no open tab refers to. */
  releaseUnused(): void
  closeNow(projectId: ProjectId, tabId: string): void
}

const EMPTY_REVISION: RevisionContent = { content: '', exists: false, isBinary: false }

/** The buffer a read gives: its text and mtime, or the error with the previous revision kept. */
export function bufferFromRead(
  checkout: GitCheckout,
  path: string,
  result: Result<FileContent>,
  previous: FileBuffer | undefined,
): FileBuffer {
  const revision = previous?.revision ?? 0
  const base = { fileKey: fileKeyOf(checkout, path), checkout, path, isDirty: false } as const
  if (!result.ok) {
    const content = { kind: 'error', message: result.error } as const
    return { ...base, diskContent: '', revision, mtimeMs: null, content, diskState: 'in-sync' }
  }
  return {
    ...base,
    diskContent: result.data.content,
    revision: revision + 1,
    mtimeMs: result.data.mtimeMs,
    content: contentOf(result.data),
    diskState: 'in-sync',
  }
}

function usedFileKeys(tabsByProject: Readonly<Record<ProjectId, TabsState>>): Set<string> {
  return new Set(
    Object.entries(tabsByProject).flatMap(([projectId, tabs]) =>
      tabs.tabs.map((tab) => fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)),
    ),
  )
}

function createLoaders(set: EditorSet, get: EditorGet) {
  const loadFile = async (checkout: GitCheckout, path: string): Promise<void> => {
    const result = await dugout.files.read(checkout, path)
    const buffer = bufferFromRead(checkout, path, result, get().buffers[fileKeyOf(checkout, path)])
    set((state) => ({ buffers: { ...state.buffers, [buffer.fileKey]: buffer } }))
  }
  const ensureFile = async (checkout: GitCheckout, path: string): Promise<void> => {
    if (!get().buffers[fileKeyOf(checkout, path)]) await loadFile(checkout, path)
  }
  const loadDiff = async (tabId: string, checkout: GitCheckout, path: string, staged: boolean) => {
    const [original, modified] = await Promise.all([
      dugout.git.show(checkout, path, staged ? 'HEAD' : 'INDEX'),
      staged ? dugout.git.show(checkout, path, 'INDEX') : Promise.resolve(null),
    ])
    const sides: DiffSides = {
      original: original.ok ? original.data : EMPTY_REVISION,
      stagedModified: modified ? (modified.ok ? modified.data : EMPTY_REVISION) : null,
    }
    set((state) => ({ diffs: { ...state.diffs, [tabId]: sides } }))
  }
  return { loadFile, ensureFile, loadDiff }
}

function createStateOps(set: EditorSet, get: EditorGet) {
  const tabsOf = (projectId: ProjectId) => get().tabsByProject[projectId] ?? EMPTY_TABS
  const setTabs = (projectId: ProjectId, change: (tabs: TabsState) => TabsState) =>
    set((state) => {
      const current = state.tabsByProject[projectId] ?? EMPTY_TABS
      const next = change(current)
      return next === current
        ? state
        : { tabsByProject: { ...state.tabsByProject, [projectId]: next } }
    })
  const patchBuffer = (fileKey: string, change: Partial<FileBuffer>) =>
    set((state) => {
      const current = state.buffers[fileKey]
      return current
        ? { buffers: { ...state.buffers, [fileKey]: { ...current, ...change } } }
        : state
    })
  const setSaveError = (fileKey: string, error: string | null) =>
    set((state) => ({ saveErrors: { ...state.saveErrors, [fileKey]: error } }))
  return { tabsOf, setTabs, patchBuffer, setSaveError }
}

export function createEditorOps(set: EditorSet, get: EditorGet): EditorOps {
  const stateOps = createStateOps(set, get)
  const releaseUnused = () => {
    const used = usedFileKeys(get().tabsByProject)
    const unused = Object.keys(get().buffers).filter((key) => !used.has(key))
    if (unused.length === 0) return
    editorBridge().release(unused)
    set((state) => ({
      buffers: Object.fromEntries(Object.entries(state.buffers).filter(([key]) => used.has(key))),
    }))
  }
  const closeNow = (projectId: ProjectId, tabId: string) => {
    stateOps.setTabs(projectId, (tabs) => closeTab(tabs, tabId))
    set((state) => ({
      diffs: Object.fromEntries(Object.entries(state.diffs).filter(([id]) => id !== tabId)),
      pendingClose: { ...state.pendingClose, [projectId]: null },
    }))
    releaseUnused()
  }
  return { ...stateOps, ...createLoaders(set, get), releaseUnused, closeNow }
}
