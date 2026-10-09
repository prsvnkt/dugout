import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { useDismiss } from '@renderer/lib/useDismiss'
import { CheckBadge } from '@renderer/features/checks/CheckBadge'
import { checkLabel } from '@renderer/features/checks/checks'
import { usePaneCheck } from '@renderer/features/checks/checkStore'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { inboxEntries, type InboxEntry } from './inbox'
import { useInboxStore } from './inboxStore'
import { ToolCallView } from './ToolCallView'
import styles from './Inbox.module.css'

function timeAgo(since: number): string {
  const minutes = Math.round((Date.now() - since) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

const ENTRY_SELECTOR = '[data-inbox-entry]'
const STEP: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

function EntryRow({ entry, onOpen }: { entry: InboxEntry; onOpen(): void }) {
  const who = `${entry.projectName} · ${entry.agentLabel}${entry.taskNumber ? ` #${entry.taskNumber}` : ''}`
  const hasApprovals = entry.approvals.length > 0
  const paneCheck = usePaneCheck(entry.paneId)
  const check = paneCheck.state === 'idle' ? null : paneCheck
  const checkText = check ? `, ${checkLabel(check)}` : ''
  return (
    <li>
      <button
        className={styles.entry}
        onClick={onOpen}
        aria-label={`${who}: ${entry.detail ?? entry.activity}${checkText}`}
        data-inbox-entry
      >
        <span className={styles.who}>
          <ActivityIndicator activity={entry.activity} label={who} />
          {check && <CheckBadge check={check} />}
          <span className={styles.time}>{timeAgo(entry.since)}</span>
        </span>
        {hasApprovals
          ? entry.approvals.map((call, index) => <ToolCallView key={index} call={call} />)
          : entry.detail && <span className={styles.detail}>{entry.detail}</span>}
      </button>
    </li>
  )
}

/** Up and down move between entries, so Return on one jumps straight to that agent. */
function moveFocus(event: KeyboardEvent<HTMLElement>): void {
  const step = STEP[event.key]
  if (!step) return
  event.preventDefault()
  const entries = [...event.currentTarget.querySelectorAll<HTMLElement>(ENTRY_SELECTOR)]
  const current = entries.indexOf(document.activeElement as HTMLElement)
  const next = current === -1 ? 0 : (current + step + entries.length) % entries.length
  entries[next]?.focus()
}

/** Title bar: agents across all projects that need you or have finished, one click away. */
export function InboxButton() {
  const projects = useProjectsStore((state) => state.projects)
  const layouts = useWorkspaceStore((state) => state.layouts)
  const activities = useWorkspaceStore((state) => state.activities)
  const details = useWorkspaceStore((state) => state.details)
  const { isOpen, toggle, close } = useInboxStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const entries = useMemo(
    () => inboxEntries({ projects, layouts, activities, details }),
    [projects, layouts, activities, details],
  )
  const waiting = entries.filter((entry) => entry.activity === 'needs-input')
  const finished = entries.filter((entry) => entry.activity === 'done')

  useDismiss(wrapRef, isOpen, close)

  // Opening the inbox (⇧⌘I) puts the keyboard on the most urgent entry.
  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>(ENTRY_SELECTOR)?.focus()
  }, [isOpen])

  /** Shows the agent with the keyboard in its terminal, ready to answer its prompt. */
  const open = (entry: InboxEntry) => {
    close()
    useProjectsStore.getState().select(entry.projectId)
    useWorkspaceStore.getState().revealPane(entry.projectId, entry.paneId)
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
        <div
          className={styles.panel}
          role="dialog"
          aria-label="Inbox"
          ref={panelRef}
          onKeyDown={moveFocus}
        >
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
          {entries.length > 0 && (
            <p className={styles.hint}>↑ ↓ to choose · Return to go to the agent</p>
          )}
        </div>
      )}
    </div>
  )
}
