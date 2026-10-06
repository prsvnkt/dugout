import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { literalSecrets, MCP_SERVER_TYPES, type McpServer } from '@shared/agentConfig'
import { serverFromDraft, type ServerDraft } from './serverDraft'
import styles from './AgentSettings.module.css'

interface ServerFormProps {
  readonly initial: ServerDraft
  readonly takenNames: readonly string[]
  readonly isBusy: boolean
  onSave(server: McpServer): void
  onCancel(): void
}

const TYPE_LABEL: Readonly<Record<McpServer['type'], string>> = {
  stdio: 'Command (stdio)',
  http: 'HTTP',
  sse: 'SSE',
}

/** A labelled form field; the label names only the field, not the control's contents. */
function Field(props: { label: string; hint?: string; children: (id: string) => ReactElement }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {props.label}
        {props.hint && <span className={styles.hint}> {props.hint}</span>}
      </label>
      {props.children(id)}
    </div>
  )
}

/** Add or edit one MCP server. */
export function ServerForm({ initial, takenNames, isBusy, onSave, onCancel }: ServerFormProps) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (field: keyof ServerDraft) => (event: { target: { value: string } }) =>
    setDraft({ ...draft, [field]: event.target.value })
  const parsed = serverFromDraft(draft, takenNames)
  const secrets = parsed.ok ? literalSecrets(parsed.server) : []
  const isStdio = draft.type === 'stdio'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (parsed.ok) onSave(parsed.server)
    else setError(parsed.error)
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="MCP server">
      <Field label="Name">
        {(id) => (
          <input id={id} value={draft.name} onChange={set('name')} placeholder="github" autoFocus />
        )}
      </Field>
      <Field label="Type">
        {(id) => (
          <select id={id} value={draft.type} onChange={set('type')}>
            {MCP_SERVER_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {isStdio ? (
        <>
          <Field label="Command">
            {(id) => (
              <input id={id} value={draft.command} onChange={set('command')} placeholder="npx" />
            )}
          </Field>
          <Field label="Arguments" hint="one per line">
            {(id) => <textarea id={id} value={draft.args} onChange={set('args')} rows={3} />}
          </Field>
        </>
      ) : (
        <Field label="URL">
          {(id) => (
            <input
              id={id}
              value={draft.url}
              onChange={set('url')}
              placeholder="https://example.com/mcp"
            />
          )}
        </Field>
      )}
      <Field
        label={isStdio ? 'Environment' : 'Headers'}
        hint={isStdio ? 'NAME=value per line' : 'Name: value per line'}
      >
        {(id) => <textarea id={id} value={draft.pairs} onChange={set('pairs')} rows={3} />}
      </Field>
      {secrets.length > 0 && (
        <p className={styles.warning} role="note">
          ⚠ {secrets.join(', ')} {secrets.length === 1 ? 'looks' : 'look'} like a secret. .mcp.json
          is usually committed, so write{' '}
          <code>
            ${'{'}NAME{'}'}
          </code>{' '}
          and set the value in your shell instead.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="submit" className={styles.primary} disabled={isBusy}>
          Save server
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
