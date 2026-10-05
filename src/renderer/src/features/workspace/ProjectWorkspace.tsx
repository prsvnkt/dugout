import { Fragment } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { TerminalPane } from '@renderer/features/terminal/TerminalPane'
import { GitPanel } from '@renderer/features/git/GitPanel'
import { useGitStore, useProjectGit } from '@renderer/features/git/gitStore'
import { useGitAutoRefresh } from '@renderer/features/git/useGitAutoRefresh'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { MAX_PANES_PER_PROJECT } from './layout'
import { useProjectLayout, useWorkspaceStore } from './workspaceStore'
import styles from './ProjectWorkspace.module.css'

interface ProjectWorkspaceProps {
  readonly project: Project
  readonly isActive: boolean
}

const MIN_PANE_SIZE_PX = 240
const MIN_GIT_PANEL_PX = 280
const DEFAULT_GIT_PANEL_PX = 380
const MAX_GIT_PANEL_SIZE = '70%'

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

function TerminalsArea({ project, isActive, onAdd }: TerminalsAreaProps) {
  const layout = useProjectLayout(project.id)
  const closePane = useWorkspaceStore((state) => state.closePane)
  const focusPane = useWorkspaceStore((state) => state.focusPane)
  const setActivity = useWorkspaceStore((state) => state.setActivity)
  const setTerminalId = useWorkspaceStore((state) => state.setTerminalId)
  const accent = projectColorVar(project.color)

  if (layout.panes.length === 0) return <EmptyWorkspace onAdd={onAdd} />
  return (
    <Group orientation="horizontal" className={styles.panes}>
      {layout.panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 && <Separator className={styles.separator} />}
          <Panel id={pane.id} minSize={MIN_PANE_SIZE_PX}>
            <TerminalPane
              kind={pane.kind}
              projectId={project.id}
              cwd={project.rootPath}
              accentColor={accent}
              isFocused={layout.focusedPaneId === pane.id}
              shouldFocus={isActive && layout.focusedPaneId === pane.id}
              onFocus={() => focusPane(project.id, pane.id)}
              onClose={() => closePane(project.id, pane.id)}
              onActivity={(activity) => setActivity(pane.id, activity)}
              onTerminalId={(terminalId) => setTerminalId(pane.id, terminalId)}
            />
          </Panel>
        </Fragment>
      ))}
    </Group>
  )
}

/**
 * All terminals of one project, side by side. Stays mounted while another project is
 * shown (hidden with `visibility`, which keeps its size) so terminals keep running.
 */
export function ProjectWorkspace({ project, isActive }: ProjectWorkspaceProps) {
  const layout = useProjectLayout(project.id)
  const addPane = useWorkspaceStore((state) => state.addPane)
  const isGitPanelOpen = useGitStore((state) => state.isPanelOpen)
  const togglePanel = useGitStore((state) => state.togglePanel)
  const changeCount = useProjectGit(project.id).status?.files.length ?? 0
  const accent = projectColorVar(project.color)
  const canAddPane = layout.panes.length < MAX_PANES_PER_PROJECT
  const add = (kind: TerminalKind) => addPane(project.id, kind)
  useGitAutoRefresh(project.id, isActive)

  return (
    <div className={styles.workspace} data-active={isActive} aria-hidden={!isActive}>
      <div className={styles.toolbar}>
        <span className={styles.projectName} style={{ color: accent }}>
          {project.name}
        </span>
        <div className={styles.toolbarActions}>
          <button disabled={!canAddPane} onClick={() => add('claude')} title="New Claude pane (⌘T)">
            + Claude
          </button>
          <button disabled={!canAddPane} onClick={() => add('shell')} title="New shell (⇧⌘T)">
            + Shell
          </button>
          <button
            onClick={togglePanel}
            aria-pressed={isGitPanelOpen}
            title="Toggle git panel (⇧⌘G)"
          >
            Git{changeCount > 0 && ` · ${changeCount}`}
          </button>
        </div>
      </div>
      <Group orientation="horizontal" className={styles.body}>
        <Panel id="terminals" minSize={MIN_PANE_SIZE_PX}>
          <div className={styles.terminals}>
            <TerminalsArea project={project} isActive={isActive} onAdd={add} />
          </div>
        </Panel>
        {isGitPanelOpen && (
          <>
            <Separator className={styles.separator} />
            <Panel
              id="git"
              defaultSize={DEFAULT_GIT_PANEL_PX}
              minSize={MIN_GIT_PANEL_PX}
              maxSize={MAX_GIT_PANEL_SIZE}
            >
              <GitPanel project={project} />
            </Panel>
          </>
        )}
      </Group>
    </div>
  )
}
