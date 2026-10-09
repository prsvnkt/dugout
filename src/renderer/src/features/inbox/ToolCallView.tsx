import type { TextChange, ToolCallPreview } from '@shared/toolCall'
import { diffPreview } from './diffPreview'
import styles from './ToolCallView.module.css'

const DIFF_MARK = { context: ' ', removed: '-', added: '+', more: '…' } as const

function Diff({ change }: { change: TextChange }) {
  return (
    <span className={styles.code} data-testid="tool-diff">
      {diffPreview(change).map((line, index) => (
        <span key={index} className={styles.diffLine} data-type={line.type}>
          <span className={styles.mark} aria-hidden>
            {DIFF_MARK[line.type]}
          </span>
          {line.text || ' '}
        </span>
      ))}
    </span>
  )
}

function Body({ call }: { call: ToolCallPreview }) {
  switch (call.kind) {
    case 'command':
      return <span className={styles.code}>{call.command}</span>
    case 'edit':
      return (
        <>
          {call.changes.map((change, index) => (
            <Diff key={index} change={change} />
          ))}
        </>
      )
    case 'other':
      return (
        <span className={styles.code}>
          {call.fields.map((field) => (
            <span key={field.name} className={styles.field}>
              <span className={styles.fieldName}>{field.name}:</span> {field.value}
            </span>
          ))}
        </span>
      )
  }
}

function subject(call: ToolCallPreview): string | null {
  if (call.kind === 'command') return call.description
  if (call.kind === 'edit') return call.filePath
  return null
}

/** One tool call waiting for approval, in full: the command, the edit as a diff, or its arguments. */
export function ToolCallView({ call }: { call: ToolCallPreview }) {
  const about = subject(call)
  return (
    <span className={styles.call} data-testid="tool-call">
      <span className={styles.head}>
        <span className={styles.tool}>{call.tool}</span>
        {about && <span className={styles.subject}>{about}</span>}
      </span>
      <Body call={call} />
    </span>
  )
}
