import type { Project } from '@shared/project'
import { GitPanel } from '@renderer/features/git/GitPanel'
import { useGitStore } from '@renderer/features/git/gitStore'
import { TasksPanel } from './TasksPanel'
import styles from './RightPanel.module.css'

/** The right side panel: the git review or the project's tasks, chosen in the activity rail. */
export function RightPanel({ project, isActive }: { project: Project; isActive: boolean }) {
  const view = useGitStore((state) => state.panelView)
  return (
    <div className={styles.panel}>
      {view === 'review' ? (
        <GitPanel project={project} />
      ) : (
        <TasksPanel project={project} isActive={isActive} />
      )}
    </div>
  )
}
