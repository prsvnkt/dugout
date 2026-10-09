import type { AgentKind } from '@shared/agents'
import type { CompareTarget } from '@shared/compare'

export type EditorTabKind =
  'file' | 'diff' | 'compare' | 'agent-settings' | 'task' | 'usage' | 'context' | 'timeline'

/** The agent session a timeline tab shows (decision 048). */
export interface TimelineTarget {
  readonly agent: AgentKind
  readonly sessionId: string
}

export interface EditorTab {
  readonly id: string
  readonly kind: EditorTabKind
  /** Path relative to the checkout root. */
  readonly path: string
  /** Diff tabs: whether they show staged (index vs HEAD) or unstaged changes. */
  readonly staged: boolean
  /** The worktree the file belongs to, or null for the project's main checkout. */
  readonly worktreePath: string | null
  /** A preview tab is replaced by the next file opened as a preview (VS Code behaviour). */
  readonly isPreview: boolean
  /** Compare tabs: the worktrees being compared. */
  readonly compare?: CompareTarget
  /** Task tabs: the task's number, and how its source writes it ("#12", "ENG-12"). */
  readonly taskNumber?: number
  readonly taskKey?: string
  /** Timeline tabs: the session they show. */
  readonly timeline?: TimelineTarget
}

/** A project's one Context tab. */
export const CONTEXT_TAB_ID = 'context'

/** One tab per task, so opening a task again focuses its tab. */
export const taskTabId = (number: number): string => `task:${number}`
/** One tab per session, so opening its timeline again focuses that tab. */
export const timelineTabId = (sessionId: string): string => `timeline:${sessionId}`

export interface TabsState {
  readonly tabs: readonly EditorTab[]
  readonly activeTabId: string | null
}

export const EMPTY_TABS: TabsState = { tabs: [], activeTabId: null }

export function openTab(
  state: TabsState,
  tab: Omit<EditorTab, 'isPreview'>,
  { isPreview }: { isPreview: boolean },
): TabsState {
  const existing = state.tabs.find((candidate) => candidate.id === tab.id)
  if (existing) {
    const tabs = isPreview
      ? state.tabs
      : state.tabs.map((t) => (t.id === tab.id ? { ...t, isPreview: false } : t))
    return { tabs, activeTabId: tab.id }
  }

  const opened: EditorTab = { ...tab, isPreview }
  const previewIndex = isPreview ? state.tabs.findIndex((candidate) => candidate.isPreview) : -1
  const tabs =
    previewIndex === -1
      ? [...state.tabs, opened]
      : state.tabs.map((candidate, index) => (index === previewIndex ? opened : candidate))
  return { tabs, activeTabId: opened.id }
}

export function pinTab(state: TabsState, tabId: string): TabsState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId)
  if (!tab?.isPreview) return state
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, isPreview: false } : t)),
  }
}

export function activateTab(state: TabsState, tabId: string): TabsState {
  if (state.activeTabId === tabId || !state.tabs.some((tab) => tab.id === tabId)) return state
  return { ...state, activeTabId: tabId }
}

export function closeTab(state: TabsState, tabId: string): TabsState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId)
  if (index === -1) return state
  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  if (tabs.length === 0) return EMPTY_TABS
  if (state.activeTabId !== tabId) return { ...state, tabs }
  return { tabs, activeTabId: tabs[Math.min(index, tabs.length - 1)]?.id ?? null }
}
