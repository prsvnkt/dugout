import { useCallback, useRef, useState, type ReactNode, type Ref } from 'react'
import { BookOpen, Files, GitBranch, ListChecks, Plus, type LucideIcon } from 'lucide-react'
import { AGENT_LIST, NEW_AGENT_SHORTCUT, NEW_WORKTREE_AGENT_SHORTCUT } from '@shared/agents'
import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { useProjectContext } from '@renderer/features/context/contextStore'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { CONTEXT_TAB_ID } from '@renderer/features/editor/tabs'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useDefaultAgent } from '@renderer/features/start/defaultAgentStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { Icon } from '@renderer/lib/Icon'
import { useMenuKeys } from '@renderer/lib/useArrowNavigation'
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
  readonly ref?: Ref<HTMLButtonElement>
  /** Set on a button that opens a menu: whether the menu is open. */
  readonly expanded?: boolean
  onClick(): void
}

function RailButton(props: RailButtonProps) {
  const { icon, label, title, isActive, badge, ref, expanded, onClick } = props
  const isMenuButton = expanded !== undefined
  return (
    <button
      ref={ref}
      aria-haspopup={isMenuButton ? 'menu' : undefined}
      aria-expanded={expanded}
      className={styles.button}
      data-active={isActive}
      aria-pressed={isMenuButton ? undefined : isActive}
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(wrapRef, isOpen, close, triggerRef)
  const onMenuKeyDown = useMenuKeys(menuRef, isOpen)
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
        expanded={isOpen}
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div
          className={styles.menu}
          role="menu"
          aria-label="New agent"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
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

/** Opens the project's Context tab; the badge counts notes agents proposed. */
function ContextButton({ project }: { project: Project }) {
  const openContext = useEditorStore((state) => state.openContext)
  const isActive = useProjectTabs(project.id).activeTabId === CONTEXT_TAB_ID
  const proposed = useProjectContext(project.id).context?.proposals.length ?? 0
  return (
    <RailButton
      icon={BookOpen}
      label={proposed > 0 ? `Project context, ${proposed} proposed` : 'Project context'}
      title={proposed > 0 ? `Context · ${proposed} proposed by agents` : 'Context for agents'}
      isActive={isActive}
      badge={proposed}
      onClick={() => openContext(project.id)}
    />
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
      <ContextButton project={project} />
      <hr className={styles.divider} />
      <NewPaneMenu project={project} onAdd={onAdd} />
    </nav>
  )
}
