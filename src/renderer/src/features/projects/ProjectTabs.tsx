import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { useMenuKeys } from '@renderer/lib/useArrowNavigation'
import { useDismiss } from '@renderer/lib/useDismiss'
import type { Project } from '@shared/project'
import { AccountButton } from '@renderer/features/github/AccountButton'
import { InboxButton } from '@renderer/features/inbox/InboxButton'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { projectUsageLines } from '@renderer/features/usage/usageFormat'
import { useUsageStore } from '@renderer/features/usage/usageStore'
import { useProjectAttention } from '@renderer/features/workspace/workspaceStore'
import { projectColorVar } from './projectColor'
import { useProjectsStore } from './projectsStore'
import { CloseProjectButton } from './CloseProjectButton'
import styles from './ProjectTabs.module.css'

const SHORTCUT_LIMIT = 9

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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useDismiss(
    wrapRef,
    isOpen,
    useCallback(() => setIsOpen(false), []),
    triggerRef,
  )
  const onMenuKeyDown = useMenuKeys(menuRef, isOpen)

  const choose = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className={styles.newWrap} ref={wrapRef}>
      <button
        ref={triggerRef}
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
        <div
          className={styles.menu}
          role="menu"
          aria-label="New project"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
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

/** The tab's tooltip: name and shortcut, then the project's token usage once loaded. */
function useTabTitle(project: Project, index: number): string {
  const usage = useUsageStore((state) => state.projects[project.id])
  const name = index < SHORTCUT_LIMIT ? `${project.name} (⌘${index + 1})` : project.name
  return [name, ...projectUsageLines(usage)].join('\n')
}

interface ProjectTabProps {
  readonly project: Project
  readonly index: number
  readonly isSelected: boolean
  onSelect(): void
}

function ProjectTab({ project, index, isSelected, onSelect }: ProjectTabProps) {
  const title = useTabTitle(project, index)
  const loadUsage = useUsageStore((state) => state.load)
  // Usage is loaded when the tooltip is about to show, so idle tabs cost nothing.
  const refreshUsage = () => void loadUsage(project.id)
  return (
    <li
      className={styles.tab}
      data-selected={isSelected}
      style={{ '--project-color': projectColorVar(project.color) } as CSSProperties}
    >
      <button
        className={styles.select}
        onClick={onSelect}
        onMouseEnter={refreshUsage}
        onFocus={refreshUsage}
        aria-current={isSelected ? 'page' : undefined}
        aria-keyshortcuts={index < SHORTCUT_LIMIT ? `Meta+${index + 1}` : undefined}
        title={title}
      >
        <span className={styles.dot} aria-hidden />
        <span className={styles.name}>{project.name}</span>
        <TabAttention projectId={project.id} />
      </button>
      <CloseProjectButton project={project} />
    </li>
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
            <ProjectTab
              key={project.id}
              project={project}
              index={index}
              isSelected={project.id === selectedId}
              onSelect={() => select(project.id)}
            />
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
