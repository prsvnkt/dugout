import { useMemo, useRef } from 'react'
import { useDismiss } from '@renderer/lib/useDismiss'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { inboxEntries, type InboxEntry } from './inbox'
import { useInboxStore } from './inboxStore'
import styles from './Inbox.module.css'

function timeAgo(since: number): string {
  const minutes = Math.round((Date.now() - since) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function EntryRow({ entry, onOpen }: { entry: InboxEntry; onOpen(): void }) {
  const who = `${entry.projectName} · ${entry.agentLabel}${entry.taskNumber ? ` #${entry.taskNumber}` : ''}`
  return (
    <li>
      <button
        className={styles.entry}
        onClick={onOpen}
        aria-label={`${who}: ${entry.detail ?? entry.activity}`}
      >
        <span className={styles.who}>
          <ActivityIndicator activity={entry.activity} label={who} />
          <span className={styles.time}>{timeAgo(entry.since)}</span>
        </span>
        {entry.detail && <span className={styles.detail}>{entry.detail}</span>}
      </button>
    </li>
  )
}

/** Title bar: agents across all projects that need you or have finished, one click away. */
export function InboxButton() {
  const projects = useProjectsStore((state) => state.projects)
  const layouts = useWorkspaceStore((state) => state.layouts)
  const activities = useWorkspaceStore((state) => state.activities)
  const details = useWorkspaceStore((state) => state.details)
  const { isOpen, toggle, close } = useInboxStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const entries = useMemo(
    () => inboxEntries({ projects, layouts, activities, details }),
    [projects, layouts, activities, details],
  )
  const waiting = entries.filter((entry) => entry.activity === 'needs-input')
  const finished = entries.filter((entry) => entry.activity === 'done')

  useDismiss(wrapRef, isOpen, close)

  const open = (entry: InboxEntry) => {
    close()
    useProjectsStore.getState().select(entry.projectId)
    useWorkspaceStore.getState().focusPane(entry.projectId, entry.paneId)
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.button}
        data-urgent={waiting.length > 0}
        onClick={toggle}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Inbox, ${waiting.length} need you, ${finished.length} done`}
        title="Inbox (⇧⌘I)"
      >
        Inbox
        {entries.length > 0 && <span className={styles.count}>{entries.length}</span>}
      </button>
      {isOpen && (
        <div className={styles.panel} role="dialog" aria-label="Inbox">
          {entries.length === 0 && <p className={styles.empty}>Nothing needs you right now.</p>}
          {waiting.length > 0 && (
            <section aria-label="Needs you">
              <h3 className={styles.heading}>Needs you</h3>
              <ul className={styles.list}>
                {waiting.map((entry) => (
                  <EntryRow key={entry.paneId} entry={entry} onOpen={() => open(entry)} />
                ))}
              </ul>
            </section>
          )}
          {finished.length > 0 && (
            <section aria-label="Done">
              <h3 className={styles.heading}>Done</h3>
              <ul className={styles.list}>
                {finished.map((entry) => (
                  <EntryRow key={entry.paneId} entry={entry} onOpen={() => open(entry)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
