import { useState, type FormEvent } from 'react'
import type { ProjectId } from '@shared/project'
import { MarkdownEditor } from './markdown/MarkdownEditor'
import { useTaskStore } from './taskStore'
import styles from './Tasks.module.css'

interface NewTaskFormProps {
  readonly projectId: ProjectId
  onDone(): void
  onError(message: string): void
}

/** Title plus a markdown description (with a preview); creates a GitHub issue. */
export function NewTaskForm({ projectId, onDone, onError }: NewTaskFormProps) {
  const create = useTaskStore((state) => state.create)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create({ projectId, title, body })
      .then(onDone)
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
  }
  return (
    <form className={styles.newTask} onSubmit={submit} aria-label="New task">
      <input
        className={styles.input}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        aria-label="Title"
        autoFocus
      />
      <MarkdownEditor
        value={body}
        onChange={setBody}
        label="Description"
        placeholder="Description (optional, markdown)"
        rows={5}
      />
      <div className={styles.formActions}>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={!title.trim()}>
          Create task
        </button>
      </div>
    </form>
  )
}
