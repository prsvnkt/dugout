import type { CSSProperties } from 'react'
import { projectColorVar } from '@renderer/features/projects/projectColor'
import { useSelectedProject } from '@renderer/features/projects/projectsStore'
import { useCheckoutGit } from '@renderer/features/git/gitStore'
import { useActivityCount, useProjectLayout, useSelectedCheckout } from './workspaceStore'
import styles from './StatusBar.module.css'

function terminalCount(count: number): string {
  return count === 1 ? '1 terminal' : `${count} terminals`
}

function ProjectStatus({ projectId }: { projectId: string }) {
  const layout = useProjectLayout(projectId)
  const needsInput = useActivityCount(projectId, 'needs-input')
  const working = useActivityCount(projectId, 'working')
  const parts = [
    needsInput > 0 && `${needsInput} needs you`,
    working > 0 && `${working} working`,
    terminalCount(layout.panes.length),
  ].filter(Boolean)
  return <span>{parts.join(' · ')}</span>
}

function BranchStatus({ projectId }: { projectId: string }) {
  const status = useCheckoutGit(useSelectedCheckout(projectId)).status
  if (!status) return null
  const sync = [status.ahead > 0 && `↑${status.ahead}`, status.behind > 0 && `↓${status.behind}`]
  return (
    <span className={styles.branch}>
      ⎇ {status.branch ?? 'detached'} {sync.filter(Boolean).join(' ')}
    </span>
  )
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
      <BranchStatus projectId={project.id} />
      <span className={styles.spacer} />
      <ProjectStatus projectId={project.id} />
    </footer>
  )
}
