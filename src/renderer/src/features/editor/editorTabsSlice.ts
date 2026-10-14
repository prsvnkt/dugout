import type { ProjectId } from '@shared/project'
import type { EditorOps } from './editorOps'
import { tabIdOf, type EditorGet, type EditorSet, type EditorTabActions } from './editorState'
import { checkoutOf, fileKeyOf } from './fileKey'
import {
  activateTab,
  CONTEXT_TAB_ID,
  openTab,
  pinTab,
  taskTabId,
  timelineTabId,
  type EditorTab,
  type TabsState,
} from './tabs'

type OpenActions = Pick<
  EditorTabActions,
  | 'openFile'
  | 'openDiff'
  | 'openCompare'
  | 'openAgentSettings'
  | 'openUsage'
  | 'openContext'
  | 'openTimeline'
  | 'openTask'
>
type CloseActions = Omit<EditorTabActions, keyof OpenActions>
type NewTab = Omit<EditorTab, 'isPreview'>

/** A tab that shows a view rather than a file in a checkout. */
function viewTab(id: string, kind: EditorTab['kind'], title: string): NewTab {
  return { id, kind, path: title, staged: false, worktreePath: null }
}

/** Whether closing this tab loses unsaved edits: the file's last editable tab, while dirty. */
function closeNeedsConfirm(tabs: TabsState, tab: EditorTab, isDirty: boolean): boolean {
  const isStagedDiff = (candidate: EditorTab) => candidate.kind === 'diff' && candidate.staged
  const isLastTabForFile =
    tabs.tabs.filter(
      (other) =>
        other.path === tab.path && other.worktreePath === tab.worktreePath && !isStagedDiff(other),
    ).length <= 1
  return isDirty && isLastTabForFile && !isStagedDiff(tab)
}

function createOpenActions(ops: EditorOps): OpenActions {
  const openView = (projectId: ProjectId, tab: NewTab, isPreview = false) =>
    ops.setTabs(projectId, (tabs) => openTab(tabs, tab, { isPreview }))
  return {
    openFile(projectId, worktreePath, path, isPreview) {
      const checkout = checkoutOf(projectId, worktreePath)
      const id = tabIdOf('file', fileKeyOf(checkout, path), false)
      openView(projectId, { id, kind: 'file', path, staged: false, worktreePath }, isPreview)
      ops.releaseUnused()
      void ops.ensureFile(checkout, path)
    },
    openDiff(projectId, worktreePath, path, staged) {
      const checkout = checkoutOf(projectId, worktreePath)
      const id = tabIdOf('diff', fileKeyOf(checkout, path), staged)
      openView(projectId, { id, kind: 'diff', path, staged, worktreePath }, true)
      ops.releaseUnused()
      if (!staged) void ops.ensureFile(checkout, path)
      void ops.loadDiff(id, checkout, path, staged)
    },
    openCompare: (projectId, key, target) =>
      openView(projectId, {
        ...viewTab(`compare:${key}`, 'compare', target.title),
        compare: target,
      }),
    openAgentSettings: (projectId) =>
      openView(projectId, viewTab('agent-settings', 'agent-settings', 'Agent settings')),
    openContext: (projectId) => openView(projectId, viewTab(CONTEXT_TAB_ID, 'context', 'Context')),
    openUsage: (projectId) => openView(projectId, viewTab('usage', 'usage', 'Token usage')),
    openTimeline: (projectId, target, title) =>
      openView(projectId, {
        ...viewTab(timelineTabId(target.sessionId), 'timeline', title),
        timeline: target,
      }),
    openTask(projectId, task, isPreview) {
      const tab = viewTab(taskTabId(task.number), 'task', `${task.key} ${task.title}`)
      openView(projectId, { ...tab, taskNumber: task.number, taskKey: task.key }, isPreview)
      ops.releaseUnused()
    },
  }
}

function createCloseActions(set: EditorSet, get: EditorGet, ops: EditorOps): CloseActions {
  const setPending = (projectId: ProjectId, tabId: string | null) =>
    set((state) => ({ pendingClose: { ...state.pendingClose, [projectId]: tabId } }))
  const fileKeyOfTab = (projectId: ProjectId, tab: EditorTab) =>
    fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)
  return {
    activate: (projectId, tabId) => ops.setTabs(projectId, (tabs) => activateTab(tabs, tabId)),
    pin: (projectId, tabId) => ops.setTabs(projectId, (tabs) => pinTab(tabs, tabId)),
    requestClose(projectId, tabId) {
      const tabs = ops.tabsOf(projectId)
      const tab = tabs.tabs.find((candidate) => candidate.id === tabId)
      if (!tab) return
      const isDirty = get().buffers[fileKeyOfTab(projectId, tab)]?.isDirty ?? false
      if (closeNeedsConfirm(tabs, tab, isDirty)) setPending(projectId, tabId)
      else ops.closeNow(projectId, tabId)
    },
    async resolveClose(projectId, choice) {
      const tabId = get().pendingClose[projectId]
      if (!tabId) return
      if (choice === 'cancel') {
        setPending(projectId, null)
        return
      }
      const tab = ops.tabsOf(projectId).tabs.find((candidate) => candidate.id === tabId)
      if (choice === 'save' && tab) {
        const saved = await get().save(fileKeyOfTab(projectId, tab))
        if (!saved) return
      }
      ops.closeNow(projectId, tabId)
    },
    removeProject(projectId) {
      set((state) => ({
        tabsByProject: Object.fromEntries(
          Object.entries(state.tabsByProject).filter(([id]) => id !== projectId),
        ),
      }))
      ops.releaseUnused()
    },
  }
}

/** Opening, focusing and closing tabs; files and diffs load through the shared ops. */
export function createTabsSlice(set: EditorSet, get: EditorGet, ops: EditorOps): EditorTabActions {
  return { ...createOpenActions(ops), ...createCloseActions(set, get, ops) }
}
