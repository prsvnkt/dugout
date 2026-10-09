import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Plus, X } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { useDismiss } from '@renderer/lib/useDismiss'
import type { Project } from '@shared/project'
import { AccountButton } from '@renderer/features/github/AccountButton'
import { InboxButton } from '@renderer/features/inbox/InboxButton'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { useProjectAttention } from '@renderer/features/workspace/workspaceStore'
import { projectColorVar } from './projectColor'
import { useProjectsStore } from './projectsStore'
import { useCloseProject, useOpenPaneCount } from './useCloseProject'
import styles from './ProjectTabs.module.css'

const SHORTCUT_LIMIT = 9
const CONFIRM_WIDTH_PX = 260
const CONFIRM_GAP_PX = 4

interface ProjectTabsProps {
  onAddProject(): void
  onCloneProject(): void
}

/** The most urgent agent status in a project, e.g. "Needs you". */
function TabAttention({ projectId }: { projectId: string }) {
  const attention = useProjectAttention(projectId)
  if (!attention) return null
  return (
    <ActivityIndicator
      activity={attention}
      label={ACTIVITY_LABEL[attention]}
      className={styles.attention}
    />
  )
}

/** "+" next to the tabs: open an existing folder or clone a repository. */
function NewProjectMenu({ onAddProject, onCloneProject }: ProjectTabsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss(
    wrapRef,
    isOpen,
    useCallback(() => setIsOpen(false), []),
  )

  const choose = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className={styles.newWrap} ref={wrapRef}>
      <button
        className={styles.newTab}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="New project"
        title="New project"
      >
        <Icon icon={Plus} />
      </button>
      {isOpen && (
        <div className={styles.menu} role="menu">
          <button role="menuitem" onClick={() => choose(onAddProject)}>
            Add project… <kbd>⇧⌘O</kbd>
          </button>
          <button role="menuitem" onClick={() => choose(onCloneProject)}>
            Clone repository… <kbd>⇧⌘C</kbd>
          </button>
        </div>
      )}
    </div>
  )
}

/** The close button on a tab: closes the project, asking first when agents or shells would stop. */
function CloseProjectButton({ project }: { project: Project }) {
  const openPanes = useOpenPaneCount(project.id)
  const closeProject = useCloseProject()
  // Where the confirmation opens. Fixed to the window: the scrolling tab strip would clip it.
  const [confirmAt, setConfirmAt] = useState<CSSProperties | null>(null)
  const isConfirming = confirmAt !== null
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismiss(
    wrapRef,
    isConfirming,
    useCallback(() => setConfirmAt(null), []),
  )

  const askToClose = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect()
    setConfirmAt({
      top: rect.bottom + CONFIRM_GAP_PX,
      left: Math.max(CONFIRM_GAP_PX, rect.right - CONFIRM_WIDTH_PX),
    })
  }

  const close = () => {
    setConfirmAt(null)
    closeProject(project.id).catch((error: unknown) =>
      console.error('[projects] could not close the project', error),
    )
  }

  return (
    <div className={styles.closeWrap} ref={wrapRef}>
      <button
        className={styles.close}
        onClick={(event) => (openPanes > 0 ? askToClose(event.currentTarget) : close())}
        aria-label={`Close ${project.name}`}
        title="Close project (the folder stays on disk)"
      >
        <Icon icon={X} />
      </button>
      {confirmAt && (
        <div
          className={styles.confirm}
          style={confirmAt}
          role="dialog"
          aria-label={`Close ${project.name}?`}
        >
          <p>
            Close {project.name}? Its{' '}
            {openPanes === 1 ? 'agent or shell' : `${openPanes} agents and shells`} will stop. The
            folder stays on disk.
          </p>
          <div className={styles.confirmActions}>
            <button onClick={() => setConfirmAt(null)}>Cancel</button>
            <button className={styles.danger} onClick={close} autoFocus>
              Close project
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Chrome-style project tabs in the title bar, with the GitHub account at the far end. */
export function ProjectTabs({ onAddProject, onCloneProject }: ProjectTabsProps) {
  const { projects, selectedId, select } = useProjectsStore()

  return (
    <header className={styles.bar} aria-label="Title bar">
      <nav className={styles.nav} aria-label="Projects">
        <ul className={styles.tabs}>
          {projects.map((project, index) => (
            <li
              key={project.id}
              className={styles.tab}
              data-selected={project.id === selectedId}
              style={{ '--project-color': projectColorVar(project.color) } as CSSProperties}
            >
              <button
                className={styles.select}
                onClick={() => select(project.id)}
                aria-current={project.id === selectedId ? 'page' : undefined}
                aria-keyshortcuts={index < SHORTCUT_LIMIT ? `Meta+${index + 1}` : undefined}
                title={index < SHORTCUT_LIMIT ? `${project.name} (⌘${index + 1})` : project.name}
              >
                <span className={styles.dot} aria-hidden />
                <span className={styles.name}>{project.name}</span>
                <TabAttention projectId={project.id} />
              </button>
              <CloseProjectButton project={project} />
            </li>
          ))}
        </ul>
        {/* With no projects, the welcome screen already offers both. */}
        {projects.length > 0 && (
          <NewProjectMenu onAddProject={onAddProject} onCloneProject={onCloneProject} />
        )}
      </nav>
      <div className={styles.end}>
        <InboxButton />
        <AccountButton />
      </div>
    </header>
  )
}
