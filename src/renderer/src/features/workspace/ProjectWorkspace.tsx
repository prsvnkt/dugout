import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { TerminalPane } from '@renderer/features/terminal/TerminalPane'
import { RightPanel } from '@renderer/features/tasks/RightPanel'
import { useCheckoutGit, useGitStore } from '@renderer/features/git/gitStore'
import { EditorArea } from '@renderer/features/editor/EditorArea'
import { useProjectTabs } from '@renderer/features/editor/editorStore'
import { ExplorerPanel } from '@renderer/features/explorer/ExplorerPanel'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { WorktreeError } from '@renderer/features/worktrees/WorktreeError'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { MAX_PANES_PER_PROJECT } from './layout'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { SidePanel } from './SidePanel'
import { useCheckoutRefresh } from './useCheckoutRefresh'
import { useProjectLayout, useSelectedCheckout, useWorkspaceStore } from './workspaceStore'
import styles from './ProjectWorkspace.module.css'

interface ProjectWorkspaceProps {
  readonly project: Project
  readonly isActive: boolean
}

const MIN_PANE_SIZE_PX = 240
const MIN_GIT_PANEL_PX = 280
const DEFAULT_GIT_PANEL_PX = 380
const MAX_GIT_PANEL_SIZE = '70%'
const DEFAULT_EXPLORER_PX = 240
const MIN_EXPLORER_PX = 160
const MAX_EXPLORER_SIZE = '40%'
const MIN_EDITOR_PX = 120
const MIN_TERMINALS_PX = 120
const DEFAULT_EDITOR_SIZE = '60%'

function EmptyWorkspace({ onAdd }: { onAdd(kind: TerminalKind): void }) {
  return (
    <div className={styles.empty}>
      <p className={styles.hint}>No terminals yet.</p>
      <div className={styles.emptyActions}>
        <button className={styles.primary} onClick={() => onAdd('claude')}>
          New Claude pane <kbd>⌘T</kbd>
        </button>
        <button className={styles.secondary} onClick={() => onAdd('shell')}>
          New shell <kbd>⇧⌘T</kbd>
        </button>
      </div>
    </div>
  )
}

interface TerminalsAreaProps {
  readonly project: Project
  readonly isActive: boolean
  onAdd(kind: TerminalKind): void
}

/** Above the terminals: where new Claude, worktree and shell panes are started. */
function TerminalsHeader({
  project,
  onAdd,
}: {
  project: Project
  onAdd(kind: TerminalKind): void
}) {
  const layout = useProjectLayout(project.id)
  const startWorktreeSession = useWorktreeStore((state) => state.startSession)
  const canAddPane = layout.panes.length < MAX_PANES_PER_PROJECT
  return (
    <div className={styles.terminalsHeader}>
      <span className={styles.terminalsTitle}>Terminals</span>
      <div className={styles.toolbarActions}>
        <button disabled={!canAddPane} onClick={() => onAdd('claude')} title="New Claude pane (⌘T)">
          + Claude
        </button>
        <button disabled={!canAddPane} onClick={() => onAdd('codex')} title="New Codex pane (⌥⇧⌘T)">
          + Codex
        </button>
        <button
          disabled={!canAddPane}
          onClick={() => void startWorktreeSession(project.id)}
          title="New Claude pane in its own worktree and branch (⌥⌘T)"
        >
          + Worktree
        </button>
        <button disabled={!canAddPane} onClick={() => onAdd('shell')} title="New shell (⇧⌘T)">
          + Shell
        </button>
      </div>
    </div>
  )
}

function TerminalsArea({ project, isActive, onAdd }: TerminalsAreaProps) {
  const layout = useProjectLayout(project.id)
  const closePane = useWorkspaceStore((state) => state.closePane)
  const focusPane = useWorkspaceStore((state) => state.focusPane)
  const setActivity = useWorkspaceStore((state) => state.setActivity)
  const setTerminalId = useWorkspaceStore((state) => state.setTerminalId)
  const setPaneSession = useWorkspaceStore((state) => state.setPaneSession)
  const restartPane = useWorkspaceStore((state) => state.restartPane)
  const clearInitialPrompt = useWorkspaceStore((state) => state.clearInitialPrompt)
  const accent = projectColorVar(project.color)

  if (layout.panes.length === 0) return <EmptyWorkspace onAdd={onAdd} />
  return (
    <Group orientation="horizontal" className={styles.panes}>
      {layout.panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 && <Separator className={styles.separator} />}
          <Panel id={pane.id} minSize={MIN_PANE_SIZE_PX}>
            <TerminalPane
              key={`${pane.id}:${pane.generation}`}
              kind={pane.kind}
              resumeSessionId={pane.sessionId}
              initialPrompt={pane.initialPrompt}
              task={pane.task}
              projectId={project.id}
              cwd={pane.worktree?.path ?? project.rootPath}
              branch={pane.worktree?.branch ?? null}
              accentColor={accent}
              isFocused={layout.focusedPaneId === pane.id}
              shouldFocus={isActive && layout.focusedPaneId === pane.id}
              onFocus={() => focusPane(project.id, pane.id)}
              onClose={() => closePane(project.id, pane.id)}
              onActivity={(activity, detail) => setActivity(pane.id, activity, detail)}
              onTerminalId={(terminalId) => {
                setTerminalId(pane.id, terminalId)
                if (terminalId) clearInitialPrompt(project.id, pane.id)
              }}
              onSessionId={(sessionId) => setPaneSession(project.id, pane.id, sessionId)}
              onRestart={(options) => restartPane(project.id, pane.id, options)}
            />
          </Panel>
        </Fragment>
      ))}
    </Group>
  )
}

/**
 * One project's workspace: explorer (left), editor tabs above its terminals (center) and the
 * git panel (right); both side panels collapse to rails. Stays mounted while another project is
 * shown (hidden with `visibility`, which keeps its size) so terminals keep running.
 */
export function ProjectWorkspace({ project, isActive }: ProjectWorkspaceProps) {
  const addPane = useWorkspaceStore((state) => state.addPane)
  const setFocusedArea = useWorkspaceStore((state) => state.setFocusedArea)
  const isGitPanelOpen = useGitStore((state) => state.isPanelOpen)
  const setGitPanelOpen = useGitStore((state) => state.setPanelOpen)
  const isExplorerOpen = useExplorerStore((state) => state.isOpen)
  const setExplorerOpen = useExplorerStore((state) => state.setOpen)
  const changeCount = useCheckoutGit(useSelectedCheckout(project.id)).status?.files.length ?? 0
  const hasOpenTabs = useProjectTabs(project.id).tabs.length > 0
  const add = (kind: TerminalKind) => addPane(project.id, kind)
  useCheckoutRefresh(project.id, isActive)

  return (
    <div className={styles.workspace} data-active={isActive} aria-hidden={!isActive}>
      <WorktreeError projectId={project.id} />
      {/* Every slot is always rendered, so collapsing panels never remounts the terminals. */}
      <Group orientation="horizontal" className={styles.body}>
        <SidePanel
          id="explorer"
          side="left"
          label="Explorer"
          isExpanded={isExplorerOpen}
          onExpandedChange={setExplorerOpen}
          defaultSize={DEFAULT_EXPLORER_PX}
          minSize={MIN_EXPLORER_PX}
          maxSize={MAX_EXPLORER_SIZE}
        >
          <ExplorerPanel project={project} />
        </SidePanel>
        <Separator className={styles.separator} />
        <Panel id="center" minSize={MIN_PANE_SIZE_PX}>
          <Group orientation="vertical" className={styles.center}>
            {hasOpenTabs && (
              <>
                <Panel id="editor" defaultSize={DEFAULT_EDITOR_SIZE} minSize={MIN_EDITOR_PX}>
                  <EditorArea projectId={project.id} />
                </Panel>
                <Separator className={styles.separatorHorizontal} />
              </>
            )}
            <Panel id="terminals" minSize={MIN_TERMINALS_PX}>
              <div
                className={styles.terminals}
                onFocusCapture={() => setFocusedArea(project.id, 'terminal')}
              >
                <TerminalsHeader project={project} onAdd={add} />
                <TerminalsArea project={project} isActive={isActive} onAdd={add} />
              </div>
            </Panel>
          </Group>
        </Panel>
        <Separator className={styles.separator} />
        <SidePanel
          id="git"
          side="right"
          label={changeCount > 0 ? `Git & Tasks · ${changeCount}` : 'Git & Tasks'}
          isExpanded={isGitPanelOpen}
          onExpandedChange={setGitPanelOpen}
          defaultSize={DEFAULT_GIT_PANEL_PX}
          minSize={MIN_GIT_PANEL_PX}
          maxSize={MAX_GIT_PANEL_SIZE}
        >
          <RightPanel project={project} isActive={isActive} />
        </SidePanel>
      </Group>
    </div>
  )
}
