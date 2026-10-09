import { useState } from 'react'
import { Markdown } from './Markdown'
import styles from './MarkdownEditor.module.css'

type Mode = 'write' | 'preview'

interface MarkdownEditorProps {
  readonly value: string
  /** The textarea's accessible name, e.g. "Description". */
  readonly label: string
  readonly placeholder: string
  readonly rows: number
  onChange(value: string): void
}

/** A markdown textarea with a Write / Preview toggle, as on GitHub. */
export function MarkdownEditor({ value, label, placeholder, rows, onChange }: MarkdownEditorProps) {
  const [mode, setMode] = useState<Mode>('write')
  const modeButton = (target: Mode, text: string) => (
    <button
      type="button"
      className={styles.mode}
      aria-pressed={mode === target}
      onClick={() => setMode(target)}
    >
      {text}
    </button>
  )
  return (
    <div className={styles.editor}>
      <div className={styles.modes} role="group" aria-label="Write or preview">
        {modeButton('write', 'Write')}
        {modeButton('preview', 'Preview')}
      </div>
      {mode === 'write' ? (
        <textarea
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          rows={rows}
        />
      ) : (
        <div className={styles.preview} aria-label="Preview" role="region">
          {value.trim() ? (
            <Markdown text={value} />
          ) : (
            <p className={styles.empty}>Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  )
}
