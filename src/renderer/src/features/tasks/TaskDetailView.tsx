import { useState, type FormEvent } from 'react'
import type { ProjectId } from '@shared/project'
import { TASK_STATUS_LABEL, TASK_STATUSES, type TaskDetail, type TaskStatus } from '@shared/tasks'
import { dugout } from '@renderer/lib/dugout'
import { useTaskStore } from './taskStore'
import styles from './Tasks.module.css'

interface TaskDetailViewProps {
  readonly projectId: ProjectId
  readonly task: TaskDetail
  readonly isBusy: boolean
  readonly hasAgent: boolean
  onError(message: string): void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** One task: description, status, comments, and what you can do with it. */
export function TaskDetailView({
  projectId,
  task,
  isBusy,
  hasAgent,
  onError,
}: TaskDetailViewProps) {
  const { update, comment, startAgent, select } = useTaskStore()
  const [note, setNote] = useState('')
  const run = (action: Promise<unknown>) =>
    action.catch((error: unknown) =>
      onError(error instanceof Error ? error.message : String(error)),
    )

  const postComment = (event: FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    void run(comment(projectId, task.number, note).then(() => setNote('')))
  }

  return (
    <section className={styles.detail} aria-label={`Task #${task.number}`}>
      <header className={styles.detailHeader}>
        <button
          className={styles.back}
          onClick={() => void select(projectId, null)}
          aria-label="Back to tasks"
        >
          ‹
        </button>
        <span className={styles.number}>#{task.number}</span>
        <h3 className={styles.detailTitle}>{task.title}</h3>
      </header>

      <div className={styles.actions}>
        <label className={styles.statusSelect}>
          <span className={styles.visuallyHidden}>Status</span>
          <select
            aria-label="Status"
            value={task.status}
            disabled={isBusy}
            onChange={(event) =>
              void run(
                update({
                  projectId,
                  number: task.number,
                  status: event.target.value as TaskStatus,
                }),
              )
            }
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TASK_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.primary}
          disabled={isBusy || task.status === 'done'}
          onClick={() => void run(startAgent(projectId, task.number))}
          title="Start Claude in a new worktree with this task as its first prompt"
        >
          {hasAgent ? 'Start another agent' : 'Start agent'}
        </button>
        <button onClick={() => void run(dugout.tasks.openInBrowser(projectId, task.number))}>
          Open on GitHub
        </button>
      </div>

      <div className={styles.body}>{task.body || <em>No description.</em>}</div>

      <ul className={styles.comments} aria-label="Comments">
        {task.comments.map((entry, index) => (
          <li key={index} className={styles.comment}>
            <span className={styles.commentMeta}>
              {entry.author} · {formatDate(entry.createdAt)}
            </span>
            <div className={styles.body}>{entry.body}</div>
          </li>
        ))}
      </ul>

      <form className={styles.commentForm} onSubmit={postComment}>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add a comment"
          aria-label="Add a comment"
          rows={3}
        />
        <button type="submit" disabled={isBusy || !note.trim()}>
          Comment
        </button>
      </form>
    </section>
  )
}
