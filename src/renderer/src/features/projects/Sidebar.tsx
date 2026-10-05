import type { Project } from '@shared/project'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { useProjectAttention } from '@renderer/features/workspace/workspaceStore'
import { projectColorVar } from './projectColor'
import { useProjectsStore } from './projectsStore'
import styles from './Sidebar.module.css'

const SHORTCUT_LIMIT = 9

/** The most urgent agent status in a project, e.g. "Needs you". */
function ProjectAttention({ projectId }: { projectId: string }) {
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

interface SidebarProps {
  onAddProject(): void
  onEditProject(project: Project): void
}

export function Sidebar({ onAddProject, onEditProject }: SidebarProps) {
  const { projects, selectedId, select } = useProjectsStore()

  return (
    <nav className={styles.sidebar} aria-label="Projects">
      <div className={styles.titlebar} />
      <h2 className={styles.heading}>Projects</h2>
      <ul className={styles.list}>
        {projects.map((project, index) => (
          <li key={project.id} className={styles.item} data-selected={project.id === selectedId}>
            <button
              className={styles.select}
              onClick={() => select(project.id)}
              aria-current={project.id === selectedId ? 'page' : undefined}
              aria-keyshortcuts={index < SHORTCUT_LIMIT ? `Meta+${index + 1}` : undefined}
            >
              <span
                className={styles.dot}
                style={{ background: projectColorVar(project.color) }}
                aria-hidden
              />
              <span className={styles.label}>
                <span className={styles.name}>{project.name}</span>
                <ProjectAttention projectId={project.id} />
              </span>
              {index < SHORTCUT_LIMIT && (
                <kbd className={styles.shortcut} aria-hidden>
                  ⌘{index + 1}
                </kbd>
              )}
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
      <button className={styles.add} onClick={onAddProject} title="Add project (⇧⌘O)">
        + Add project
      </button>
    </nav>
  )
}
