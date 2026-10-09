import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Files, GitBranch, ListChecks, Plus, type LucideIcon } from 'lucide-react'
import { AGENT_LIST, NEW_AGENT_SHORTCUT, NEW_WORKTREE_AGENT_SHORTCUT } from '@shared/agents'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useDefaultAgent } from '@renderer/features/start/defaultAgentStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { Icon } from '@renderer/lib/Icon'
import { useDismiss } from '@renderer/lib/useDismiss'
import { MAX_PANES_PER_PROJECT } from './layout'
import { useProjectLayout } from './workspaceStore'
import styles from './ActivityRail.module.css'

interface RailButtonProps {
  readonly icon: LucideIcon
  readonly label: string
  readonly title: string
  readonly isActive: boolean
  readonly badge?: number
  onClick(): void
}

function RailButton({ icon, label, title, isActive, badge, onClick }: RailButtonProps) {
  return (
    <button
      className={styles.button}
      data-active={isActive}
      aria-pressed={isActive}
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      <Icon icon={icon} size="rail" />
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
  shortcut?: string | undefined
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
      {props.label} {props.shortcut && <kbd>{props.shortcut}</kbd>}
    </button>
  )
}

/** "+" in the rail: start any agent, an agent in a worktree or a shell, or open agent settings. */
function NewPaneMenu({ project, onAdd }: { project: Project; onAdd(kind: TerminalKind): void }) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(wrapRef, isOpen, close)
  const canAddPane = useProjectLayout(project.id).panes.length < MAX_PANES_PER_PROJECT
  const startWorktreeSession = useWorktreeStore((state) => state.startSession)
  const openAgentSettings = useEditorStore((state) => state.openAgentSettings)
  const openUsage = useEditorStore((state) => state.openUsage)
  const defaultAgent = useDefaultAgent()
  const choose = (action: () => void) => () => {
    close()
    action()
  }

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <RailButton
        icon={Plus}
        label="New agent"
        title="New agent"
        isActive={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div className={styles.menu} role="menu" aria-label="New agent">
          {AGENT_LIST.map((agent) => (
            <MenuItem
              key={agent.kind}
              label={`New ${agent.label} agent`}
              shortcut={agent.kind === defaultAgent ? NEW_AGENT_SHORTCUT.symbols : undefined}
              disabled={!canAddPane}
              onSelect={choose(() => onAdd(agent.kind))}
            />
          ))}
          <hr className={styles.divider} />
          {AGENT_LIST.map((agent) => (
            <MenuItem
              key={agent.kind}
              label={`New ${agent.label} agent in worktree`}
              shortcut={
                agent.kind === defaultAgent ? NEW_WORKTREE_AGENT_SHORTCUT.symbols : undefined
              }
              disabled={!canAddPane}
              onSelect={choose(() => void startWorktreeSession(project.id, agent.kind))}
            />
          ))}
          <hr className={styles.divider} />
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
          <MenuItem label="Token usage" onSelect={choose(() => openUsage(project.id))} />
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
        icon={Files}
        label={isExplorerOpen ? 'Hide Explorer' : 'Show Explorer'}
        title="Agents and files (⌘B)"
        isActive={isExplorerOpen}
        onClick={toggleExplorer}
      />
      <RailButton
        icon={GitBranch}
        label={isReviewOpen ? 'Hide Git panel' : 'Show Git panel'}
        title={changeCount > 0 ? `Changes · ${changeCount} (⇧⌘G)` : 'Changes (⇧⌘G)'}
        isActive={isReviewOpen}
        badge={changeCount}
        onClick={() => togglePanelView('review')}
      />
      <RailButton
        icon={ListChecks}
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
