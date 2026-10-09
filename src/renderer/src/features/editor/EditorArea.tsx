import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'
import type { ProjectId } from '@shared/project'
import { splitPath } from '@renderer/features/git/changeKind'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { AgentSettingsView } from '@renderer/features/agentConfig/AgentSettingsView'
import { CompareView } from '@renderer/features/compare/CompareView'
import { FileTypeIcon } from '@renderer/features/explorer/FileTypeIcon'
import { Icon } from '@renderer/lib/Icon'
import { useEditorStore, useProjectTabs, type FileBuffer } from './editorStore'
import { checkoutOf, fileKeyOf } from './fileKey'
import type { EditorTab } from './tabs'
import styles from './EditorArea.module.css'

const EditorSurface = lazy(() => import('./monaco/EditorSurface'))

function tabLabel(tab: EditorTab): string {
  if (tab.kind === 'compare' || tab.kind === 'agent-settings') return tab.path
  const { name } = splitPath(tab.path)
  if (tab.kind === 'file') return name
  return `${name} (${tab.staged ? 'staged' : 'changes'})`
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
  if (buffer.error) return <p className={styles.notice}>{buffer.error}</p>
  if (buffer.isBinary) return <p className={styles.notice}>Binary file — not shown.</p>
  if (buffer.isTooLarge)
    return <p className={styles.notice}>File is too large to open (over 5 MB).</p>
  return null
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

/** Tabs of opened files and diffs, shown above the terminals (VS Code-style). */
export function EditorArea({ projectId }: { projectId: ProjectId }) {
  const { tabs, activeTabId } = useProjectTabs(projectId)
  const { activate, pin, requestClose } = useEditorStore()
  const buffers = useEditorStore((state) => state.buffers)
  const diffs = useEditorStore((state) => state.diffs)
  const pendingClose = useEditorStore((state) => state.pendingClose[projectId] ?? null)
  const setFocusedArea = useWorkspaceStore((state) => state.setFocusedArea)

  const active = tabs.find((tab) => tab.id === activeTabId)
  if (!active) return null
  const isCompare = active.kind === 'compare'
  const isAgentSettings = active.kind === 'agent-settings'
  const fileKey = fileKeyOf(checkoutOf(projectId, active.worktreePath), active.path)
  const buffer = buffers[fileKey]
  const pendingTab = tabs.find((tab) => tab.id === pendingClose)
  const needsBuffer = !isCompare && !isAgentSettings && (active.kind === 'file' || !active.staged)
  const isEditable = buffer && !buffer.error && !buffer.isBinary && !buffer.isTooLarge

  return (
    <section
      className={styles.area}
      aria-label="Editor"
      onFocusCapture={() => setFocusedArea(projectId, 'editor')}
      onMouseDownCapture={() => setFocusedArea(projectId, 'editor')}
    >
      <div className={styles.tabStrip} role="tablist">
        {tabs.map((tab) => {
          const tabBuffer = buffers[fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)]
          const isDirty = tabBuffer?.isDirty && !(tab.kind === 'diff' && tab.staged)
          return (
            <div
              key={tab.id}
              className={styles.tab}
              data-active={tab.id === activeTabId}
              data-preview={tab.isPreview}
            >
              <button
                role="tab"
                aria-selected={tab.id === activeTabId}
                className={styles.tabButton}
                onClick={() => activate(projectId, tab.id)}
                onDoubleClick={() => pin(projectId, tab.id)}
                title={tab.path}
              >
                {(tab.kind === 'file' || tab.kind === 'diff') && (
                  <FileTypeIcon name={splitPath(tab.path).name} />
                )}
                {tab.kind === 'diff' && (
                  <span className={styles.diffMark} aria-hidden>
                    Δ
                  </span>
                )}
                {tabLabel(tab)}
              </button>
              <button
                className={styles.tabClose}
                data-dirty={isDirty}
                onClick={() => requestClose(projectId, tab.id)}
                aria-label={`Close ${tabLabel(tab)}${isDirty ? ' (unsaved)' : ''}`}
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
        })}
      </div>
      {pendingTab && <ClosePrompt projectId={projectId} path={pendingTab.path} />}
      {buffer && needsBuffer && <DiskBanner buffer={buffer} />}
      {isAgentSettings ? (
        <AgentSettingsView projectId={projectId} />
      ) : isCompare && active.compare ? (
        <CompareView projectId={projectId} tabId={active.id} target={active.compare} />
      ) : needsBuffer && !isEditable ? (
        <Notice buffer={buffer} />
      ) : (
        <Suspense fallback={<p className={styles.notice}>Loading editor…</p>}>
          <EditorSurface
            tab={active}
            fileKey={fileKey}
            modelRevision={buffer?.revision ?? 0}
            diff={diffs[active.id]}
          />
        </Suspense>
      )}
    </section>
  )
}
