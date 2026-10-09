import { useState } from 'react'
import {
  MAX_CONTEXT_TITLE_LENGTH,
  type ContextEntryInput,
  type ContextScope,
} from '@shared/context'
import { MarkdownEditor } from '@renderer/features/tasks/markdown/MarkdownEditor'
import styles from './Context.module.css'

type NewKind = ContextEntryInput['kind'] | 'doc'

const KIND_CHOICES: readonly { kind: NewKind; label: string }[] = [
  { kind: 'note', label: 'Note' },
  { kind: 'file', label: 'File or folder' },
  { kind: 'link', label: 'Link' },
  { kind: 'doc', label: 'Import document' },
]

interface AddEntryFormProps {
  readonly isBusy: boolean
  onAdd(entry: ContextEntryInput): Promise<boolean>
  onImport(scope: ContextScope): void
}

function toInput(
  kind: Exclude<NewKind, 'doc'>,
  base: { scope: ContextScope; title: string; body: string },
  subject: string,
): ContextEntryInput {
  if (kind === 'file') return { ...base, kind, path: subject.trim().replace(/^\.?\/+/, '') }
  if (kind === 'link') return { ...base, kind, url: subject.trim() }
  return { ...base, kind }
}

/** Adds a note, a pinned file or folder, or a link; or imports a document from disk. */
export function AddEntryForm({ isBusy, onAdd, onImport }: AddEntryFormProps) {
  const [kind, setKind] = useState<NewKind>('note')
  const [scope, setScope] = useState<ContextScope>('shared')
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const needsSubject = kind === 'file' || kind === 'link'
  const canSave = title.trim() !== '' && (!needsSubject || subject.trim() !== '')

  const submit = async () => {
    if (kind === 'doc') return onImport(scope)
    const input = toInput(kind, { scope, title: title.trim(), body }, subject)
    if (await onAdd(input)) {
      setTitle('')
      setSubject('')
      setBody('')
    }
  }

  return (
    <form
      className={styles.form}
      aria-label="Add context"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset className={styles.choices} aria-label="Kind">
        {KIND_CHOICES.map((choice) => (
          <label key={choice.kind}>
            <input
              type="radio"
              name="context-kind"
              checked={kind === choice.kind}
              onChange={() => setKind(choice.kind)}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.choices} aria-label="Who can see it">
        <label>
          <input
            type="radio"
            name="context-scope"
            checked={scope === 'shared'}
            onChange={() => setScope('shared')}
          />
          Shared (.dugout/context, committed)
        </label>
        <label>
          <input
            type="radio"
            name="context-scope"
            checked={scope === 'private'}
            onChange={() => setScope('private')}
          />
          Private (this Mac only)
        </label>
      </fieldset>
      {kind !== 'doc' && (
        <>
          <div className={styles.field}>
            <label htmlFor="context-title">Title</label>
            <input
              id="context-title"
              value={title}
              maxLength={MAX_CONTEXT_TITLE_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          {needsSubject && (
            <div className={styles.field}>
              <label htmlFor="context-subject">
                {kind === 'file' ? 'Path in the project' : 'URL'}
              </label>
              <input
                id="context-subject"
                value={subject}
                placeholder={kind === 'file' ? 'src/auth' : 'https://'}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
          )}
          <MarkdownEditor
            value={body}
            label="Text"
            placeholder={kind === 'note' ? 'What should agents know?' : 'Why it matters (optional)'}
            rows={5}
            onChange={setBody}
          />
        </>
      )}
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primary}
          disabled={isBusy || (kind !== 'doc' && !canSave)}
        >
          {kind === 'doc' ? 'Choose document…' : 'Add'}
        </button>
      </div>
    </form>
  )
}
