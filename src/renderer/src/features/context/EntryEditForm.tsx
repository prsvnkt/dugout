import { useState } from 'react'
import { MAX_CONTEXT_TITLE_LENGTH, type ContextEntryView } from '@shared/context'
import { MarkdownEditor } from '@renderer/features/tasks/markdown/MarkdownEditor'
import styles from './Context.module.css'

interface EntryEditFormProps {
  readonly entry: ContextEntryView
  readonly isBusy: boolean
  onSave(title: string, body: string): void
  onCancel(): void
}

/** Edits an entry's title and Markdown; its kind, scope and file or link stay. */
export function EntryEditForm({ entry, isBusy, onSave, onCancel }: EntryEditFormProps) {
  const [title, setTitle] = useState(entry.title)
  const [body, setBody] = useState(entry.body)
  return (
    <form
      className={styles.form}
      aria-label={`Edit ${entry.title}`}
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim()) onSave(title.trim(), body)
      }}
    >
      <div className={styles.field}>
        <label htmlFor={`context-edit-${entry.id}`}>Title</label>
        <input
          id={`context-edit-${entry.id}`}
          value={title}
          maxLength={MAX_CONTEXT_TITLE_LENGTH}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <MarkdownEditor
        value={body}
        label="Text"
        placeholder="Markdown"
        rows={8}
        onChange={setBody}
      />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={isBusy || !title.trim()}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
