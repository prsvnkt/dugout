import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Project } from '@shared/project'
import { AccountButton } from '@renderer/features/github/AccountButton'
import { InboxButton } from '@renderer/features/inbox/InboxButton'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { useProjectAttention } from '@renderer/features/workspace/workspaceStore'
import { projectColorVar } from './projectColor'
import { useProjectsStore } from './projectsStore'
import styles from './ProjectTabs.module.css'

const SHORTCUT_LIMIT = 9

interface ProjectTabsProps {
  onAddProject(): void
  onCloneProject(): void
  onEditProject(project: Project): void
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
function NewProjectMenu({ onAddProject, onCloneProject }: Omit<ProjectTabsProps, 'onEditProject'>) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && wrapRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [isOpen])

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
        +
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

/** Chrome-style project tabs in the title bar, with the GitHub account at the far end. */
export function ProjectTabs({ onAddProject, onCloneProject, onEditProject }: ProjectTabsProps) {
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
              style={{ '--accent': projectColorVar(project.color) } as CSSProperties}
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
              <button
                className={styles.edit}
                onClick={() => onEditProject(project)}
                aria-label={`Edit ${project.name}`}
                title="Edit project"
              >
                ⋯
              </button>
            </li>
          ))}
        </ul>
        <NewProjectMenu onAddProject={onAddProject} onCloneProject={onCloneProject} />
      </nav>
      <div className={styles.end}>
        <InboxButton />
        <AccountButton />
      </div>
    </header>
  )
}
