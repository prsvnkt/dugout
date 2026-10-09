import { create } from 'zustand'
import type { CompareTarget } from '@shared/compare'
import type { RevisionContent } from '@shared/files'
import type { ProjectId } from '@shared/project'
import type { Task } from '@shared/tasks'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { editorBridge } from './editorBridge'
import { checkoutOf, fileKeyOf } from './fileKey'
import {
  activateTab,
  closeTab,
  EMPTY_TABS,
  openTab,
  pinTab,
  taskTabId,
  type EditorTab,
  type TabsState,
} from './tabs'

export type DiskState = 'in-sync' | 'changed-on-disk' | 'deleted'

/** What we know about one file on disk; its text lives in a Monaco model. */
export interface FileBuffer {
  readonly fileKey: string
  readonly checkout: GitCheckout
  readonly path: string
  /** Text as last read from disk. Bumping `revision` tells Monaco to load it. */
  readonly diskContent: string
  readonly revision: number
  readonly mtimeMs: number | null
  readonly isDirty: boolean
  readonly isBinary: boolean
  readonly isTooLarge: boolean
  readonly diskState: DiskState
  readonly error: string | null
}

/** The left side of a diff (HEAD or index), and the right side for staged diffs. */
export interface DiffSides {
  readonly original: RevisionContent
  /** Staged diffs show the index on the right; unstaged diffs use the working file's model. */
  readonly stagedModified: RevisionContent | null
}

interface EditorState {
  readonly tabsByProject: Readonly<Record<ProjectId, TabsState>>
  readonly buffers: Readonly<Record<string, FileBuffer>>
  readonly diffs: Readonly<Record<string, DiffSides>>
  /** Tab waiting for a Save / Don't Save answer before it closes. */
  readonly pendingClose: Readonly<Record<ProjectId, string | null>>
  readonly saveErrors: Readonly<Record<string, string | null>>
  openFile(
    projectId: ProjectId,
    worktreePath: string | null,
    path: string,
    isPreview: boolean,
  ): void
  openDiff(projectId: ProjectId, worktreePath: string | null, path: string, staged: boolean): void
  /** Opens (or focuses) a Compare tab for two worktrees, e.g. two agents on one task. */
  openCompare(projectId: ProjectId, key: string, target: CompareTarget): void
  /** Opens (or focuses) the project's Agent settings tab. */
  openAgentSettings(projectId: ProjectId): void
  /** Opens (or focuses) a task's tab; as a preview, it replaces the previous preview tab. */
  openTask(
    projectId: ProjectId,
    task: Pick<Task, 'number' | 'key' | 'title'>,
    isPreview: boolean,
  ): void
  activate(projectId: ProjectId, tabId: string): void
  pin(projectId: ProjectId, tabId: string): void
  /** Closes a tab, or asks first when its file has unsaved changes. */
  requestClose(projectId: ProjectId, tabId: string): void
  resolveClose(projectId: ProjectId, choice: 'save' | 'discard' | 'cancel'): Promise<void>
  setDirty(fileKey: string, isDirty: boolean): void
  save(fileKey: string, options?: { force?: boolean }): Promise<boolean>
  saveAll(projectId: ProjectId): Promise<void>
  /** Reloads from disk, discarding unsaved edits. */
  reload(fileKey: string): Promise<void>
  /** Keeps unsaved edits; the next save overwrites the file on disk. */
  keepMine(fileKey: string): void
  /** Picks up changes made outside the editor (e.g. by an agent) for a project's open files. */
  syncWithDisk(projectId: ProjectId): Promise<void>
  removeProject(projectId: ProjectId): void
}

const tabIdOf = (kind: EditorTab['kind'], fileKey: string, staged: boolean) =>
  `${kind}:${staged ? 's' : 'u'}:${fileKey}`

export const useEditorStore = create<EditorState>()((set, get) => {
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

  const loadFile = async (checkout: GitCheckout, path: string): Promise<void> => {
    const fileKey = fileKeyOf(checkout, path)
    const result = await dugout.files.read(checkout, path)
    const previous = get().buffers[fileKey]
    const buffer: FileBuffer = result.ok
      ? {
          fileKey,
          checkout,
          path,
          diskContent: result.data.content,
          revision: (previous?.revision ?? 0) + 1,
          mtimeMs: result.data.mtimeMs,
          isDirty: false,
          isBinary: result.data.isBinary,
          isTooLarge: result.data.isTooLarge,
          diskState: 'in-sync',
          error: null,
        }
      : {
          fileKey,
          checkout,
          path,
          diskContent: '',
          revision: previous?.revision ?? 0,
          mtimeMs: null,
          isDirty: false,
          isBinary: false,
          isTooLarge: false,
          diskState: 'in-sync',
          error: result.error,
        }
    set((state) => ({ buffers: { ...state.buffers, [fileKey]: buffer } }))
  }

  const ensureFile = async (checkout: GitCheckout, path: string) => {
    if (!get().buffers[fileKeyOf(checkout, path)]) await loadFile(checkout, path)
  }

  const loadDiff = async (tabId: string, checkout: GitCheckout, path: string, staged: boolean) => {
    const [original, modified] = await Promise.all([
      dugout.git.show(checkout, path, staged ? 'HEAD' : 'INDEX'),
      staged ? dugout.git.show(checkout, path, 'INDEX') : Promise.resolve(null),
    ])
    const empty: RevisionContent = { content: '', exists: false, isBinary: false }
    const sides: DiffSides = {
      original: original.ok ? original.data : empty,
      stagedModified: modified ? (modified.ok ? modified.data : empty) : null,
    }
    set((state) => ({ diffs: { ...state.diffs, [tabId]: sides } }))
  }

  /** Drops buffers and models that no open tab refers to. */
  const releaseUnused = () => {
    const used = new Set(
      Object.entries(get().tabsByProject).flatMap(([projectId, tabs]) =>
        tabs.tabs.map((tab) => fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)),
      ),
    )
    const unused = Object.keys(get().buffers).filter((key) => !used.has(key))
    if (unused.length === 0) return
    editorBridge().release(unused)
    set((state) => ({
      buffers: Object.fromEntries(Object.entries(state.buffers).filter(([key]) => used.has(key))),
    }))
  }

  const closeNow = (projectId: ProjectId, tabId: string) => {
    setTabs(projectId, (tabs) => closeTab(tabs, tabId))
    set((state) => ({
      diffs: Object.fromEntries(Object.entries(state.diffs).filter(([id]) => id !== tabId)),
      pendingClose: { ...state.pendingClose, [projectId]: null },
    }))
    releaseUnused()
  }

  return {
    tabsByProject: {},
    buffers: {},
    diffs: {},
    pendingClose: {},
    saveErrors: {},

    openFile(projectId, worktreePath, path, isPreview) {
      const checkout = checkoutOf(projectId, worktreePath)
      const fileKey = fileKeyOf(checkout, path)
      const tab = {
        id: tabIdOf('file', fileKey, false),
        kind: 'file' as const,
        path,
        staged: false,
        worktreePath,
      }
      setTabs(projectId, (tabs) => openTab(tabs, tab, { isPreview }))
      releaseUnused()
      void ensureFile(checkout, path)
    },

    openDiff(projectId, worktreePath, path, staged) {
      const checkout = checkoutOf(projectId, worktreePath)
      const fileKey = fileKeyOf(checkout, path)
      const id = tabIdOf('diff', fileKey, staged)
      setTabs(projectId, (tabs) =>
        openTab(tabs, { id, kind: 'diff', path, staged, worktreePath }, { isPreview: true }),
      )
      releaseUnused()
      if (!staged) void ensureFile(checkout, path)
      void loadDiff(id, checkout, path, staged)
    },

    openCompare(projectId, key, target) {
      const tab = {
        id: `compare:${key}`,
        kind: 'compare' as const,
        path: target.title,
        staged: false,
        worktreePath: null,
        compare: target,
      }
      setTabs(projectId, (tabs) => openTab(tabs, tab, { isPreview: false }))
    },

    openAgentSettings(projectId) {
      const tab = {
        id: 'agent-settings',
        kind: 'agent-settings' as const,
        path: 'Agent settings',
        staged: false,
        worktreePath: null,
      }
      setTabs(projectId, (tabs) => openTab(tabs, tab, { isPreview: false }))
    },

    openTask(projectId, task, isPreview) {
      const tab = {
        id: taskTabId(task.number),
        kind: 'task' as const,
        path: `${task.key} ${task.title}`,
        staged: false,
        worktreePath: null,
        taskNumber: task.number,
        taskKey: task.key,
      }
      setTabs(projectId, (tabs) => openTab(tabs, tab, { isPreview }))
      releaseUnused()
    },

    activate: (projectId, tabId) => setTabs(projectId, (tabs) => activateTab(tabs, tabId)),
    pin: (projectId, tabId) => setTabs(projectId, (tabs) => pinTab(tabs, tabId)),

    requestClose(projectId, tabId) {
      const tab = tabsOf(projectId).tabs.find((candidate) => candidate.id === tabId)
      if (!tab) return
      const fileKey = fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)
      const isLastTabForFile =
        tabsOf(projectId).tabs.filter(
          (other) =>
            other.path === tab.path &&
            other.worktreePath === tab.worktreePath &&
            !(other.kind === 'diff' && other.staged),
        ).length <= 1
      const needsConfirm =
        get().buffers[fileKey]?.isDirty && isLastTabForFile && !(tab.kind === 'diff' && tab.staged)
      if (needsConfirm)
        set((state) => ({ pendingClose: { ...state.pendingClose, [projectId]: tabId } }))
      else closeNow(projectId, tabId)
    },

    async resolveClose(projectId, choice) {
      const tabId = get().pendingClose[projectId]
      if (!tabId) return
      if (choice === 'cancel') {
        set((state) => ({ pendingClose: { ...state.pendingClose, [projectId]: null } }))
        return
      }
      const tab = tabsOf(projectId).tabs.find((candidate) => candidate.id === tabId)
      if (choice === 'save' && tab) {
        const saved = await get().save(fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path))
        if (!saved) return
      }
      closeNow(projectId, tabId)
    },

    setDirty(fileKey, isDirty) {
      if (get().buffers[fileKey]?.isDirty === isDirty) return
      patchBuffer(fileKey, { isDirty })
      if (isDirty) {
        // Editing pins the preview tab, as in VS Code.
        for (const [projectId, tabs] of Object.entries(get().tabsByProject)) {
          for (const tab of tabs.tabs) {
            if (
              tab.isPreview &&
              fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path) === fileKey
            ) {
              get().pin(projectId, tab.id)
            }
          }
        }
      }
    },

    async save(fileKey, options = {}) {
      const buffer = get().buffers[fileKey]
      const content = editorBridge().getContent(fileKey)
      if (!buffer || content === undefined) return false
      const expectedMtimeMs = buffer.diskState === 'in-sync' ? buffer.mtimeMs : null
      const result = await dugout.files.write(buffer.checkout, buffer.path, content, {
        expectedMtimeMs,
        ...(options.force && { force: true }),
      })
      if (!result.ok) {
        const isConflict = /changed on disk/i.test(result.error)
        if (isConflict) patchBuffer(fileKey, { diskState: 'changed-on-disk' })
        set((state) => ({ saveErrors: { ...state.saveErrors, [fileKey]: result.error } }))
        return false
      }
      editorBridge().markSaved(fileKey)
      patchBuffer(fileKey, {
        isDirty: false,
        mtimeMs: result.data.mtimeMs,
        diskState: 'in-sync',
        diskContent: content,
      })
      set((state) => ({ saveErrors: { ...state.saveErrors, [fileKey]: null } }))
      return true
    },

    async saveAll(projectId) {
      const keys = Object.values(get().buffers)
        .filter((buffer) => buffer.isDirty && buffer.checkout.projectId === projectId)
        .map((buffer) => buffer.fileKey)
      for (const key of keys) await get().save(key)
    },

    async reload(fileKey) {
      const buffer = get().buffers[fileKey]
      if (!buffer) return
      await loadFile(buffer.checkout, buffer.path)
      set((state) => ({ saveErrors: { ...state.saveErrors, [fileKey]: null } }))
    },

    keepMine(fileKey) {
      patchBuffer(fileKey, { diskState: 'in-sync', mtimeMs: null })
    },

    async syncWithDisk(projectId) {
      const buffers = Object.values(get().buffers).filter(
        (buffer) => buffer.checkout.projectId === projectId && buffer.error === null,
      )
      const byCheckout = new Map<string, FileBuffer[]>()
      for (const buffer of buffers) {
        const key = buffer.checkout.worktreePath ?? ''
        byCheckout.set(key, [...(byCheckout.get(key) ?? []), buffer])
      }
      for (const group of byCheckout.values()) {
        const first = group[0]
        if (!first) continue
        const result = await dugout.files.stat(
          first.checkout,
          group.map((buffer) => buffer.path),
        )
        if (!result.ok) continue
        for (const { path, mtimeMs } of result.data) {
          const buffer = group.find((candidate) => candidate.path === path)
          if (!buffer || buffer.mtimeMs === null || mtimeMs === buffer.mtimeMs) continue
          if (mtimeMs === null) patchBuffer(buffer.fileKey, { diskState: 'deleted' })
          else if (buffer.isDirty) patchBuffer(buffer.fileKey, { diskState: 'changed-on-disk' })
          else await loadFile(buffer.checkout, buffer.path)
        }
      }
      // Diff originals change when files are staged or committed.
      for (const tab of tabsOf(projectId).tabs.filter((candidate) => candidate.kind === 'diff')) {
        await loadDiff(tab.id, checkoutOf(projectId, tab.worktreePath), tab.path, tab.staged)
      }
    },

    removeProject(projectId) {
      set((state) => ({
        tabsByProject: Object.fromEntries(
          Object.entries(state.tabsByProject).filter(([id]) => id !== projectId),
        ),
      }))
      releaseUnused()
    },
  }
})

export function useProjectTabs(projectId: ProjectId): TabsState {
  return useEditorStore((state) => state.tabsByProject[projectId] ?? EMPTY_TABS)
}

export function useHasUnsavedChanges(): boolean {
  return useEditorStore((state) => Object.values(state.buffers).some((buffer) => buffer.isDirty))
}

export { tabIdOf }
