import { useState, type FormEvent } from 'react'
import type { TaskComment } from '@shared/tasks'
import { formatAge } from '@renderer/lib/formatAge'
import { Markdown } from './markdown/Markdown'
import { MarkdownEditor } from './markdown/MarkdownEditor'
import styles from './TaskDetailView.module.css'

interface TaskCommentsProps {
  readonly comments: readonly TaskComment[]
  readonly isBusy: boolean
  /** Resolves true once the comment is posted. */
  onComment(body: string): Promise<boolean>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** The task's comments, rendered as markdown, and a box to add one. */
export function TaskComments({ comments, isBusy, onComment }: TaskCommentsProps) {
  const [note, setNote] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!note.trim()) return
    void onComment(note).then((isPosted) => {
      if (isPosted) setNote('')
    })
  }
  return (
    <section className={styles.comments} aria-label="Discussion">
      <h2 className={styles.sectionHeading}>
        Comments <span className={styles.count}>{comments.length}</span>
      </h2>
      <ul className={styles.commentList} aria-label="Comments">
        {comments.map((entry, index) => (
          <li key={index} className={styles.comment}>
            <header className={styles.commentMeta}>
              <strong>{entry.author}</strong>
              <time dateTime={entry.createdAt} title={formatDate(entry.createdAt)}>
                {formatAge(entry.createdAt)}
              </time>
            </header>
            <div className={styles.commentBody}>
              <Markdown text={entry.body} />
            </div>
          </li>
        ))}
      </ul>
      <form className={styles.commentForm} onSubmit={submit}>
        <MarkdownEditor
          value={note}
          onChange={setNote}
          label="Add a comment"
          placeholder="Add a comment (markdown)"
          rows={3}
        />
        <button
          type="submit"
          className={`${styles.button} ${styles.primary}`}
          disabled={isBusy || !note.trim()}
        >
          Comment
        </button>
      </form>
    </section>
  )
}
