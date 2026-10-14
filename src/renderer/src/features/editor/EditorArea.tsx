import { lazy, Suspense, useCallback, useId } from 'react'
import { BookOpen, CircleDot, ListTree, X } from 'lucide-react'
import type { ProjectId } from '@shared/project'
import { displayTaskKey } from '@shared/tasks'
import { splitPath } from '@renderer/features/git/changeKind'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { AgentSettingsView } from '@renderer/features/agentConfig/AgentSettingsView'
import { CompareView } from '@renderer/features/compare/CompareView'
import { ContextView } from '@renderer/features/context/ContextView'
import { FileTypeIcon } from '@renderer/features/explorer/FileTypeIcon'
import { ReviewComments } from '@renderer/features/reviewComments/ReviewComments'
import { TaskDetailView } from '@renderer/features/tasks/TaskDetailView'
import { TimelineView } from '@renderer/features/timeline/TimelineView'
import { UsageView } from '@renderer/features/usage/UsageView'
import { Icon } from '@renderer/lib/Icon'
import { useArrowNavigation } from '@renderer/lib/useArrowNavigation'
import { useEditorStore, useProjectTabs, type FileBuffer } from './editorStore'
import { checkoutOf, fileKeyOf } from './fileKey'
import type { EditorTab } from './tabs'
import styles from './EditorArea.module.css'

const EditorSurface = lazy(() => import('./monaco/EditorSurface'))
/** Task tabs are named "#n title"; long titles are cut (the tooltip has the full one). */
const MAX_TASK_TAB_LABEL = 40

const DIFF_COMMENT_HINT =
  'Comment for the agent: select lines on the right, then press ⌘⇧M or right-click › Add Review Comment.'

/** Tabs that show a view, named by their path, with no file buffer behind them. */
const VIEW_TABS: ReadonlySet<EditorTab['kind']> = new Set([
  'compare',
  'agent-settings',
  'task',
  'usage',
  'context',
  'timeline',
])

function tabLabel(tab: EditorTab): string {
  if (tab.kind === 'task' && tab.path.length > MAX_TASK_TAB_LABEL) {
    return `${tab.path.slice(0, MAX_TASK_TAB_LABEL - 1).trimEnd()}…`
  }
  if (VIEW_TABS.has(tab.kind)) {
    return tab.path
  }
  const { name } = splitPath(tab.path)
  if (tab.kind === 'file') return name
  return `${name} (${tab.staged ? 'staged' : 'changes'})`
}

function fileKeyOfTab(projectId: ProjectId, tab: EditorTab): string {
  return fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)
}

/** Whether the tab shows a view (with what that view needs) rather than the editor. */
function hasView(tab: EditorTab): boolean {
  switch (tab.kind) {
    case 'agent-settings':
    case 'usage':
    case 'context':
      return true
    case 'timeline':
      return tab.timeline !== undefined
    case 'task':
      return tab.taskNumber !== undefined
    case 'compare':
      return tab.compare !== undefined
    default:
      return false
  }
}

function DiskBanner({ buffer }: { buffer: FileBuffer }) {
  const reload = useEditorStore((state) => state.reload)
  const keepMine = useEditorStore((state) => state.keepMine)
  const saveError = useEditorStore((state) => state.saveErrors[buffer.fileKey] ?? null)
  if (buffer.diskState === 'deleted') {
    return (
      <div className={styles.banner} role="alert">
        This file was deleted on disk.
      </div>
    )
  }
  if (buffer.diskState === 'changed-on-disk') {
    return (
      <div className={styles.banner} role="alert">
        <span>Changed on disk (e.g. by an agent) while you have unsaved edits.</span>
        <button onClick={() => void reload(buffer.fileKey)}>Reload</button>
        <button onClick={() => keepMine(buffer.fileKey)}>Keep mine</button>
      </div>
    )
  }
  if (saveError)
    return (
      <div className={styles.banner} role="alert">
        {saveError}
      </div>
    )
  return null
}

function Notice({ buffer }: { buffer: FileBuffer | undefined }) {
  if (!buffer) return <p className={styles.notice}>Loading…</p>
  switch (buffer.content.kind) {
    case 'error':
      return <p className={styles.notice}>{buffer.content.message}</p>
    case 'binary':
      return <p className={styles.notice}>Binary file — not shown.</p>
    case 'too-large':
      return <p className={styles.notice}>File is too large to open (over 5 MB).</p>
    case 'text':
      return null
  }
}

function ClosePrompt({ projectId, path }: { projectId: ProjectId; path: string }) {
  const resolveClose = useEditorStore((state) => state.resolveClose)
  return (
    <div className={styles.banner} role="alertdialog" aria-label="Unsaved changes">
      <span>Save changes to {splitPath(path).name}?</span>
      <button onClick={() => void resolveClose(projectId, 'save')}>Save</button>
      <button onClick={() => void resolveClose(projectId, 'discard')}>Don’t Save</button>
      <button onClick={() => void resolveClose(projectId, 'cancel')}>Cancel</button>
    </div>
  )
}

function TabIcon({ tab }: { tab: EditorTab }) {
  if (tab.kind === 'task') return <Icon icon={CircleDot} />
  if (tab.kind === 'context') return <Icon icon={BookOpen} />
  if (tab.kind === 'timeline') return <Icon icon={ListTree} />
  if (tab.kind !== 'file' && tab.kind !== 'diff') return null
  return (
    <>
      <FileTypeIcon name={splitPath(tab.path).name} />
      {tab.kind === 'diff' && (
        <span className={styles.diffMark} aria-hidden>
          Δ
        </span>
      )}
    </>
  )
}

interface TabProps {
  readonly projectId: ProjectId
  readonly tab: EditorTab
  readonly id: string
  readonly isActive: boolean
  readonly panelId: string
}

function Tab({ projectId, tab, id, isActive, panelId }: TabProps) {
  const activate = useEditorStore((state) => state.activate)
  const pin = useEditorStore((state) => state.pin)
  const requestClose = useEditorStore((state) => state.requestClose)
  const isBufferDirty = useEditorStore(
    (state) => state.buffers[fileKeyOfTab(projectId, tab)]?.isDirty ?? false,
  )
  const isDirty = isBufferDirty && !(tab.kind === 'diff' && tab.staged)
  const label = tabLabel(tab)
  return (
    <div className={styles.tab} data-active={isActive} data-preview={tab.isPreview}>
      <button
        role="tab"
        id={id}
        data-tab-id={tab.id}
        aria-selected={isActive}
        aria-controls={isActive ? panelId : undefined}
        tabIndex={isActive ? 0 : -1}
        className={styles.tabButton}
        onClick={() => activate(projectId, tab.id)}
        onDoubleClick={() => pin(projectId, tab.id)}
        title={tab.path}
      >
        <TabIcon tab={tab} />
        {label}
      </button>
      <button
        className={styles.tabClose}
        data-dirty={isDirty}
        onClick={() => requestClose(projectId, tab.id)}
        aria-label={`Close ${label}${isDirty ? ' (unsaved)' : ''}`}
      >
        <span className={styles.dirtyDot} aria-hidden>
          ●
        </span>
        <span className={styles.closeGlyph}>
          <Icon icon={X} />
        </span>
      </button>
    </div>
  )
}

interface TabStripProps {
  readonly projectId: ProjectId
  readonly tabs: readonly EditorTab[]
  readonly activeTabId: string | null
  readonly tabId: (index: number) => string
  readonly panelId: string
}

/** APG tabs with automatic activation: arrows focus a tab and show it. */
function TabStrip({ projectId, tabs, activeTabId, tabId, panelId }: TabStripProps) {
  const activate = useEditorStore((state) => state.activate)
  const onTabKeyDown = useArrowNavigation({
    itemSelector: '[role="tab"]',
    orientation: 'horizontal',
    wrap: true,
    onMove: useCallback(
      (item: HTMLElement) => {
        if (item.dataset.tabId) activate(projectId, item.dataset.tabId)
      },
      [activate, projectId],
    ),
  })
  return (
    <div
      className={styles.tabStrip}
      role="tablist"
      aria-label="Open files"
      onKeyDown={onTabKeyDown}
    >
      {tabs.map((tab, index) => (
        <Tab
          key={tab.id}
          projectId={projectId}
          tab={tab}
          id={tabId(index)}
          isActive={tab.id === activeTabId}
          panelId={panelId}
        />
      ))}
    </div>
  )
}

/** The view a tab shows when `hasView(tab)`. */
function TabView({ projectId, tab }: { projectId: ProjectId; tab: EditorTab }) {
  if (tab.kind === 'agent-settings') return <AgentSettingsView projectId={projectId} />
  if (tab.kind === 'usage') return <UsageView projectId={projectId} />
  if (tab.kind === 'context') return <ContextView projectId={projectId} />
  if (tab.kind === 'timeline' && tab.timeline)
    return <TimelineView key={tab.id} projectId={projectId} target={tab.timeline} />
  if (tab.kind === 'task' && tab.taskNumber !== undefined)
    return (
      <TaskDetailView
        key={tab.id}
        projectId={projectId}
        number={tab.taskNumber}
        taskKey={displayTaskKey({ number: tab.taskNumber, key: tab.taskKey })}
      />
    )
  if (tab.kind === 'compare' && tab.compare)
    return <CompareView projectId={projectId} tabId={tab.id} target={tab.compare} />
  return null
}

interface ActiveTabPanelProps {
  readonly projectId: ProjectId
  readonly active: EditorTab
  readonly panelId: string
  readonly labelledBy: string
}

function ActiveTabPanel({ projectId, active, panelId, labelledBy }: ActiveTabPanelProps) {
  const fileKey = fileKeyOfTab(projectId, active)
  const buffer = useEditorStore((state) => state.buffers[fileKey])
  const diff = useEditorStore((state) => state.diffs[active.id])
  const needsBuffer = !VIEW_TABS.has(active.kind) && (active.kind === 'file' || !active.staged)
  const isEditable = buffer?.content.kind === 'text'
  return (
    <div className={styles.panel} role="tabpanel" id={panelId} aria-labelledby={labelledBy}>
      {buffer && needsBuffer && <DiskBanner buffer={buffer} />}
      {hasView(active) ? (
        <TabView projectId={projectId} tab={active} />
      ) : needsBuffer && !isEditable ? (
        <Notice buffer={buffer} />
      ) : (
        <Suspense fallback={<p className={styles.notice}>Loading editor…</p>}>
          <EditorSurface
            projectId={projectId}
            tab={active}
            fileKey={fileKey}
            modelRevision={buffer?.revision ?? 0}
            diff={diff}
          />
        </Suspense>
      )}
      {active.kind === 'diff' && (
        <ReviewComments
          targets={[{ checkout: { projectId, worktreePath: active.worktreePath }, label: null }]}
          hint={DIFF_COMMENT_HINT}
        />
      )}
    </div>
  )
}

/** Tabs of opened files and diffs, shown above the terminals (VS Code-style). */
export function EditorArea({ projectId }: { projectId: ProjectId }) {
  const { tabs, activeTabId } = useProjectTabs(projectId)
  const pendingClose = useEditorStore((state) => state.pendingClose[projectId] ?? null)
  const setFocusedArea = useWorkspaceStore((state) => state.setFocusedArea)
  const idBase = useId()
  const tabId = (index: number) => `${idBase}-tab-${index}`
  const panelId = `${idBase}-panel`

  const active = tabs.find((tab) => tab.id === activeTabId)
  if (!active) return null
  const pendingTab = tabs.find((tab) => tab.id === pendingClose)

  return (
    <section
      className={styles.area}
      aria-label="Editor"
      onFocusCapture={() => setFocusedArea(projectId, 'editor')}
      onMouseDownCapture={() => setFocusedArea(projectId, 'editor')}
    >
      <TabStrip
        projectId={projectId}
        tabs={tabs}
        activeTabId={activeTabId}
        tabId={tabId}
        panelId={panelId}
      />
      {pendingTab && <ClosePrompt projectId={projectId} path={pendingTab.path} />}
      <ActiveTabPanel
        projectId={projectId}
        active={active}
        panelId={panelId}
        labelledBy={tabId(tabs.indexOf(active))}
      />
    </section>
  )
}
