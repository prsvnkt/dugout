import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { MAX_DEV_COMMAND_LENGTH } from '@shared/preview'
import styles from './Preview.module.css'

interface DevCommandFormProps {
  readonly initialCommand: string
  /** Rejects with a user-facing message when the command cannot be saved. */
  onSave(command: string): Promise<void>
  onCancel(): void
}

/** Edits the project's dev command in place. Blank removes it. */
export function DevCommandForm({ initialCommand, onSave, onCancel }: DevCommandFormProps) {
  const [command, setCommand] = useState(initialCommand)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setIsSaving(true)
    onSave(command)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Could not save the dev command.'),
      )
      .finally(() => setIsSaving(false))
  }
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onCancel()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.input}
        aria-label="Dev command"
        placeholder="npm run dev"
        title="Runs in a new shell with PORT set; use $PORT if your server needs a flag"
        value={command}
        maxLength={MAX_DEV_COMMAND_LENGTH}
        onChange={(event) => setCommand(event.target.value)}
        onKeyDown={cancelOnEscape}
        autoFocus
        spellCheck={false}
      />
      <button className={styles.button} type="submit" disabled={isSaving}>
        Save
      </button>
      <button className={styles.button} type="button" onClick={onCancel}>
        Cancel
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
