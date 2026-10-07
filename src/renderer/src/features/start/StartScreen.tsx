import type { Project } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import { OpenTaskList } from './OpenTaskList'
import { PromptBox } from './PromptBox'
import { RecentSessionList } from './RecentSessionList'
import styles from './StartScreen.module.css'

interface StartScreenProps {
  readonly project: Project
  readonly isActive: boolean
  onAdd(kind: TerminalKind): void
}

/** What a project shows with no agents open: a prompt box, sessions to resume, open tasks. */
export function StartScreen({ project, isActive, onAdd }: StartScreenProps) {
  return (
    <div className={styles.start}>
      <div className={styles.column}>
        <PromptBox project={project} />
        <RecentSessionList projectId={project.id} />
        <OpenTaskList project={project} isActive={isActive} />
        <div className={styles.quickActions}>
          <span>Or start empty:</span>
          <button onClick={() => onAdd('claude')}>
            New Claude agent <kbd>⌘T</kbd>
          </button>
          <button onClick={() => onAdd('codex')}>
            New Codex agent <kbd>⌥⇧⌘T</kbd>
          </button>
          <button onClick={() => onAdd('shell')}>
            New shell <kbd>⇧⌘T</kbd>
          </button>
        </div>
      </div>
    </div>
  )
}
