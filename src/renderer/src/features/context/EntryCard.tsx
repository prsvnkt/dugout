import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { AGENT_LABEL } from '@shared/agents'
import { CONTEXT_KIND_LABEL, type ContextEntryView, type PinState } from '@shared/context'
import { Markdown } from '@renderer/features/tasks/markdown/Markdown'
import { safeLinkUrl } from '@renderer/features/tasks/markdown/safeLink'
import { Icon } from '@renderer/lib/Icon'
import { EntryEditForm } from './EntryEditForm'
import styles from './Context.module.css'

const PIN_TEXT: Readonly<Record<Exclude<PinState, 'current'>, string>> = {
  stale: 'Changed since pinned',
  missing: 'No longer in the project',
}

export interface EntryActions {
  readonly isBusy: boolean
  edit(id: string, title: string, body: string): Promise<boolean>
  remove(id: string): void
  repin(id: string): void
}

function Subject({ entry }: { entry: ContextEntryView }) {
  if (entry.kind === 'file') return <code className={styles.subject}>{entry.path}</code>
  if (entry.kind === 'doc') return <span className={styles.subject}>from {entry.source}</span>
  if (entry.kind === 'codemap') {
    return <span className={styles.subject}>built by {AGENT_LABEL[entry.agent]}</span>
  }
  if (entry.kind !== 'link') return null
  const url = safeLinkUrl(entry.url)
  return url ? (
    <a className={styles.subject} href={url} target="_blank" rel="noreferrer noopener">
      {entry.url}
    </a>
  ) : (
    <span className={styles.subject}>{entry.url}</span>
  )
}

/** One context entry: what it is, whether a pinned file changed, and its Markdown on demand. */
export function EntryCard({ entry, actions }: { entry: ContextEntryView; actions: EntryActions }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const pinText = entry.pin && entry.pin !== 'current' ? PIN_TEXT[entry.pin] : null

  return (
    <li className={styles.card} aria-label={`Context ${entry.title}`}>
      <div className={styles.cardHead}>
        <span className={styles.title}>{entry.title}</span>
        <span className={styles.badge}>{CONTEXT_KIND_LABEL[entry.kind]}</span>
        <span className={styles.badge}>{entry.scope === 'shared' ? 'Shared' : 'Private'}</span>
        {pinText && (
          <span className={styles.pin}>
            <Icon icon={TriangleAlert} />
            {pinText}
          </span>
        )}
      </div>
      <Subject entry={entry} />
      {isEditing ? (
        <EntryEditForm
          entry={entry}
          isBusy={actions.isBusy}
          onCancel={() => setIsEditing(false)}
          onSave={async (title, body) => {
            if (await actions.edit(entry.id, title, body)) setIsEditing(false)
          }}
        />
      ) : (
        isOpen &&
        entry.body.trim() && (
          <div className={styles.body}>
            <Markdown text={entry.body} />
          </div>
        )
      )}
      {!isEditing && (
        <div className={styles.actions}>
          <button aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? 'Hide' : 'Show'}
          </button>
          <button onClick={() => setIsEditing(true)} disabled={actions.isBusy}>
            Edit
          </button>
          {entry.pin === 'stale' && (
            <button onClick={() => actions.repin(entry.id)} disabled={actions.isBusy}>
              Mark as current
            </button>
          )}
          {isConfirming ? (
            <button className={styles.danger} onClick={() => actions.remove(entry.id)}>
              Confirm remove
            </button>
          ) : (
            <button onClick={() => setIsConfirming(true)}>Remove</button>
          )}
        </div>
      )}
    </li>
  )
}
