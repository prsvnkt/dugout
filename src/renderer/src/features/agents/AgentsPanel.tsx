import { useMemo } from 'react'
import type { Project } from '@shared/project'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { useProjectLayout, useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { agentEntries, type AgentEntry } from './agentList'
import { useAgentsStore } from './agentsStore'
import styles from './Agents.module.css'

function describeWork(entry: AgentEntry): string | null {
  if (entry.task) return `#${entry.task.number} ${entry.task.title}`
  return entry.title
}

/** Points up; CSS turns it down while the list is open (down = minimise). */
function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <path
        d="M4 10l4-4 4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function AgentRow({ entry, onSelect }: { entry: AgentEntry; onSelect(): void }) {
  const work = describeWork(entry)
  const status = ACTIVITY_LABEL[entry.activity]
  return (
    <li>
      <button
        className={styles.row}
        data-focused={entry.isFocused}
        aria-current={entry.isFocused || undefined}
        aria-label={`${entry.number} ${entry.agentLabel}, ${status}`}
        onClick={onSelect}
      >
        <span className={styles.line}>
          <span className={styles.number}>{entry.number}</span>
          <span className={styles.label}>{entry.agentLabel}</span>
          <ActivityIndicator activity={entry.activity} label={status} className={styles.status} />
        </span>
        {(work || entry.branch) && (
          <span className={styles.sub}>
            {work && <span className={styles.work}>{work}</span>}
            {entry.branch && <span className={styles.branch}>⎇ {entry.branch}</span>}
          </span>
        )}
        {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
      </button>
    </li>
  )
}

/** The project's agents with their status, below the files; clicking one focuses its terminal. */
export function AgentsPanel({ project }: { project: Project }) {
  const layout = useProjectLayout(project.id)
  const activities = useWorkspaceStore((state) => state.activities)
  const details = useWorkspaceStore((state) => state.details)
  const focusPane = useWorkspaceStore((state) => state.focusPane)
  const isCollapsed = useAgentsStore((state) => state.isCollapsed)
  const toggleCollapsed = useAgentsStore((state) => state.toggleCollapsed)
  const entries = useMemo(
    () => agentEntries({ layout, activities, details }),
    [layout, activities, details],
  )

  return (
    <section className={styles.panel} aria-label="Agents">
      <header className={styles.header}>
        <span className={styles.title}>Agents</span>
        {entries.length > 0 && <span className={styles.count}>{entries.length}</span>}
        <button
          className={styles.toggle}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Show agents' : 'Minimise agents'}
          title={isCollapsed ? 'Show agents' : 'Minimise agents'}
          onClick={toggleCollapsed}
        >
          <Arrow />
        </button>
      </header>
      {!isCollapsed && (
        <div className={styles.scroll}>
          {entries.length === 0 ? (
            <p className={styles.empty}>No agents running. Start one with + in the rail.</p>
          ) : (
            <ul className={styles.list}>
              {entries.map((entry) => (
                <AgentRow
                  key={entry.paneId}
                  entry={entry}
                  onSelect={() => focusPane(project.id, entry.paneId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
