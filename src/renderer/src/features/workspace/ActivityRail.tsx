import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useDismiss } from '@renderer/lib/useDismiss'
import { MAX_PANES_PER_PROJECT } from './layout'
import { useProjectLayout } from './workspaceStore'
import styles from './ActivityRail.module.css'

interface RailButtonProps {
  readonly glyph: string
  readonly label: string
  readonly title: string
  readonly isActive: boolean
  readonly badge?: number
  onClick(): void
}

function RailButton({ glyph, label, title, isActive, badge, onClick }: RailButtonProps) {
  return (
    <button
      className={styles.button}
      data-active={isActive}
      aria-pressed={isActive}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      <span aria-hidden>{glyph}</span>
      {badge !== undefined && badge > 0 && (
        <span className={styles.badge} aria-hidden>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function MenuItem(props: {
  label: string
  shortcut: string
  disabled?: boolean
  onSelect(): void
}): ReactNode {
  return (
    <button
      role="menuitem"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      {props.label} <kbd>{props.shortcut}</kbd>
    </button>
  )
}

/** "+" in the rail: start Claude, Codex, worktree or shell panes, or open agent settings. */
function NewPaneMenu({ project, onAdd }: { project: Project; onAdd(kind: TerminalKind): void }) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(wrapRef, isOpen, close)
  const canAddPane = useProjectLayout(project.id).panes.length < MAX_PANES_PER_PROJECT
  const startWorktreeSession = useWorktreeStore((state) => state.startSession)
  const openAgentSettings = useEditorStore((state) => state.openAgentSettings)
  const choose = (action: () => void) => () => {
    close()
    action()
  }

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <RailButton
        glyph="+"
        label="New agent"
        title="New agent"
        isActive={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div className={styles.menu} role="menu" aria-label="New agent">
          <MenuItem
            label="New Claude agent"
            shortcut="⌘T"
            disabled={!canAddPane}
            onSelect={choose(() => onAdd('claude'))}
          />
          <MenuItem
            label="New Codex agent"
            shortcut="⌥⇧⌘T"
            disabled={!canAddPane}
            onSelect={choose(() => onAdd('codex'))}
          />
          <MenuItem
            label="New Claude agent in worktree"
            shortcut="⌥⌘T"
            disabled={!canAddPane}
            onSelect={choose(() => void startWorktreeSession(project.id))}
          />
          <MenuItem
            label="New shell"
            shortcut="⇧⌘T"
            disabled={!canAddPane}
            onSelect={choose(() => onAdd('shell'))}
          />
          <hr className={styles.divider} />
          <MenuItem
            label="Agent settings"
            shortcut="⇧⌘,"
            onSelect={choose(() => openAgentSettings(project.id))}
          />
        </div>
      )}
    </div>
  )
}

interface ActivityRailProps {
  readonly project: Project
  readonly changeCount: number
  onAdd(kind: TerminalKind): void
}

/** Far-left icon rail: toggles the explorer, the review and tasks panels, and starts panes. */
export function ActivityRail({ project, changeCount, onAdd }: ActivityRailProps) {
  const isExplorerOpen = useExplorerStore((state) => state.isOpen)
  const toggleExplorer = useExplorerStore((state) => state.toggleOpen)
  const isPanelOpen = useGitStore((state) => state.isPanelOpen)
  const panelView = useGitStore((state) => state.panelView)
  const togglePanelView = useGitStore((state) => state.togglePanelView)
  const isReviewOpen = isPanelOpen && panelView === 'review'
  const isTasksOpen = isPanelOpen && panelView === 'tasks'

  return (
    <nav className={styles.rail} aria-label="Activity">
      <RailButton
        glyph="≡"
        label={isExplorerOpen ? 'Hide Explorer' : 'Show Explorer'}
        title="Files (⌘B)"
        isActive={isExplorerOpen}
        onClick={toggleExplorer}
      />
      <RailButton
        glyph="±"
        label={isReviewOpen ? 'Hide Git panel' : 'Show Git panel'}
        title={changeCount > 0 ? `Changes · ${changeCount} (⇧⌘G)` : 'Changes (⇧⌘G)'}
        isActive={isReviewOpen}
        badge={changeCount}
        onClick={() => togglePanelView('review')}
      />
      <RailButton
        glyph="☐"
        label={isTasksOpen ? 'Hide Tasks' : 'Show Tasks'}
        title="Tasks"
        isActive={isTasksOpen}
        onClick={() => togglePanelView('tasks')}
      />
      <hr className={styles.divider} />
      <NewPaneMenu project={project} onAdd={onAdd} />
    </nav>
  )
}
