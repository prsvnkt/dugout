import type { CSSProperties } from 'react'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { useSelectedProject } from '@renderer/features/projects/projectsStore'
import { useProjectLayout } from './workspaceStore'
import styles from './StatusBar.module.css'

function terminalCount(count: number): string {
  return count === 1 ? '1 terminal' : `${count} terminals`
}

function ProjectStatus({ projectId }: { projectId: string }) {
  const layout = useProjectLayout(projectId)
  return <span>{terminalCount(layout.panes.length)}</span>
}

export function StatusBar() {
  const project = useSelectedProject()
  if (!project) return <footer className={styles.bar} />

  return (
    <footer
      className={styles.bar}
      data-has-project
      style={{ '--accent': projectColorVar(project.color) } as CSSProperties}
    >
      <span className={styles.name}>{project.name}</span>
      <span className={styles.path} title={project.rootPath}>
        {project.rootPath}
      </span>
      <span className={styles.spacer} />
      <ProjectStatus projectId={project.id} />
    </footer>
  )
}
