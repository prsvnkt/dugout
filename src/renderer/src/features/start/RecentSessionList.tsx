import type { ProjectId } from '@shared/project'
import { AGENT_LABEL } from '@shared/terminal'
import { formatAge } from '@renderer/lib/formatAge'
import type { RecentSession } from '@renderer/features/workspace/recentSessions'
import { useRecentSessions, useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import styles from './StartScreen.module.css'

function describe(session: RecentSession): string {
  const parts = [
    AGENT_LABEL[session.kind],
    session.worktree?.branch && `⎇ ${session.worktree.branch}`,
    formatAge(new Date(session.closedAt).toISOString()),
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Agent sessions closed from this project, each resumable where it left off. */
export function RecentSessionList({ projectId }: { projectId: ProjectId }) {
  const sessions = useRecentSessions(projectId)
  const resume = useWorkspaceStore((state) => state.resumeSession)
  if (sessions.length === 0) return null

  return (
    <section className={styles.section} aria-label="Pick up where you left off">
      <h2 className={styles.sectionHeading}>Pick up where you left off</h2>
      <ul className={styles.list}>
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <button className={styles.row} onClick={() => resume(projectId, session.sessionId)}>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {session.title ?? `${AGENT_LABEL[session.kind]} session`}
                </span>
                <span className={styles.rowMeta}>{describe(session)}</span>
              </span>
              <span className={styles.rowAction}>Resume</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
