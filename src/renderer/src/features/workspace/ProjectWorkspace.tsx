import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { TerminalPane } from '@renderer/features/terminal/TerminalPane'
import { RightPanel } from '@renderer/features/tasks/RightPanel'
import { useCheckoutGit, useGitStore } from '@renderer/features/git/gitStore'
import { EditorArea } from '@renderer/features/editor/EditorArea'
import { useProjectTabs } from '@renderer/features/editor/editorStore'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { WorktreeError } from '@renderer/features/worktrees/WorktreeError'
import { StartScreen } from '@renderer/features/start/StartScreen'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { ActivityRail } from './ActivityRail'
import { LeftSidebar } from './LeftSidebar'
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
const DEFAULT_GIT_PANEL_PX = 300
const MAX_GIT_PANEL_SIZE = '70%'
const DEFAULT_EXPLORER_PX = 240
const MIN_EXPLORER_PX = 160
const MAX_EXPLORER_SIZE = '40%'
const MIN_EDITOR_PX = 120
const MIN_TERMINALS_PX = 120
const DEFAULT_EDITOR_SIZE = '60%'

interface TerminalsAreaProps {
  readonly project: Project
  readonly isActive: boolean
  onAdd(kind: TerminalKind): void
}

function TerminalsArea({ project, isActive, onAdd }: TerminalsAreaProps) {
  const layout = useProjectLayout(project.id)
  const closePane = useWorkspaceStore((state) => state.closePane)
  const focusPane = useWorkspaceStore((state) => state.focusPane)
  const setActivity = useWorkspaceStore((state) => state.setActivity)
  const setSubagents = useWorkspaceStore((state) => state.setSubagents)
  const setTerminalId = useWorkspaceStore((state) => state.setTerminalId)
  const setPaneSession = useWorkspaceStore((state) => state.setPaneSession)
  const restartPane = useWorkspaceStore((state) => state.restartPane)
  const clearInitialPrompt = useWorkspaceStore((state) => state.clearInitialPrompt)
  const projectColor = projectColorVar(project.color)

  if (layout.panes.length === 0) {
    return <StartScreen project={project} isActive={isActive} onAdd={onAdd} />
  }
  return (
    <Group orientation="horizontal" className={styles.panes}>
      {layout.panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 && <Separator className={styles.separator} />}
          <Panel id={pane.id} minSize={MIN_PANE_SIZE_PX}>
            <TerminalPane
              key={`${pane.id}:${pane.generation}`}
              index={index}
              kind={pane.kind}
              resumeSessionId={pane.sessionId}
              initialPrompt={pane.initialPrompt}
              task={pane.task}
              projectId={project.id}
              cwd={pane.worktree?.path ?? project.rootPath}
              branch={pane.worktree?.branch ?? null}
              projectColor={projectColor}
              isFocused={layout.focusedPaneId === pane.id}
              shouldFocus={isActive && layout.focusedPaneId === pane.id}
              onFocus={() => focusPane(project.id, pane.id)}
              onClose={() => closePane(project.id, pane.id)}
              onActivity={(activity, detail) => setActivity(pane.id, activity, detail)}
              onSubagents={(subagents) => setSubagents(pane.id, subagents)}
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
 * One project's workspace: the activity rail, agents over the explorer (left), editor tabs above its terminals
 * (center) and the review/tasks panel (right); the rail toggles both side panels. Stays mounted
 * while another project is shown (hidden with `visibility`, which keeps its size) so terminals
 * keep running.
 */
export function ProjectWorkspace({ project, isActive }: ProjectWorkspaceProps) {
  const addPane = useWorkspaceStore((state) => state.addPane)
  const setFocusedArea = useWorkspaceStore((state) => state.setFocusedArea)
  const isRightPanelOpen = useGitStore((state) => state.isPanelOpen)
  const setRightPanelOpen = useGitStore((state) => state.setPanelOpen)
  const isExplorerOpen = useExplorerStore((state) => state.isOpen)
  const setExplorerOpen = useExplorerStore((state) => state.setOpen)
  const changeCount = useCheckoutGit(useSelectedCheckout(project.id)).status?.files.length ?? 0
  const hasOpenTabs = useProjectTabs(project.id).tabs.length > 0
  const add = (kind: TerminalKind) => addPane(project.id, kind)
  useCheckoutRefresh(project.id, isActive)

  return (
    <div className={styles.workspace} data-active={isActive} aria-hidden={!isActive}>
      <WorktreeError projectId={project.id} />
      <div className={styles.row}>
        <ActivityRail project={project} changeCount={changeCount} onAdd={add} />
        {/* Every slot is always rendered, so collapsing panels never remounts the terminals. */}
        <Group orientation="horizontal" className={styles.body}>
          <SidePanel
            id="explorer"
            isExpanded={isExplorerOpen}
            onExpandedChange={setExplorerOpen}
            defaultSize={DEFAULT_EXPLORER_PX}
            minSize={MIN_EXPLORER_PX}
            maxSize={MAX_EXPLORER_SIZE}
          >
            <LeftSidebar project={project} />
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
                  <TerminalsArea project={project} isActive={isActive} onAdd={add} />
                </div>
              </Panel>
            </Group>
          </Panel>
          <Separator className={styles.separator} />
          <SidePanel
            id="git"
            isExpanded={isRightPanelOpen}
            onExpandedChange={setRightPanelOpen}
            defaultSize={DEFAULT_GIT_PANEL_PX}
            minSize={MIN_GIT_PANEL_PX}
            maxSize={MAX_GIT_PANEL_SIZE}
          >
            <RightPanel project={project} isActive={isActive} />
          </SidePanel>
        </Group>
      </div>
    </div>
  )
}
