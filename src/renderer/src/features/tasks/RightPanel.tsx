import { useState } from 'react'
import type { Project } from '@shared/project'
import { GitPanel } from '@renderer/features/git/GitPanel'
import { TasksPanel } from './TasksPanel'
import styles from './RightPanel.module.css'

type RightTab = 'git' | 'tasks'

/** The right side panel: source control or the project's tasks. */
export function RightPanel({ project, isActive }: { project: Project; isActive: boolean }) {
  const [tab, setTab] = useState<RightTab>('git')
  return (
    <div className={styles.panel}>
      <div className={styles.tabs} role="tablist" aria-label="Side panel">
        {(['git', 'tasks'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {id === 'git' ? 'Git' : 'Tasks'}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {tab === 'git' ? (
          <GitPanel project={project} />
        ) : (
          <TasksPanel project={project} isActive={isActive} />
        )}
      </div>
    </div>
  )
}
