import { useMemo } from 'react'
import type { GitDiff } from '@shared/git'
import { parseDiff } from './parseDiff'
import styles from './DiffView.module.css'

interface DiffViewProps {
  readonly diff: GitDiff | null
  readonly path: string
  readonly staged: boolean
  onClose(): void
}

const MARKER = { added: '+', removed: '−', context: ' ' } as const

function DiffBody({ diff }: { diff: GitDiff }) {
  const hunks = useMemo(() => parseDiff(diff.text), [diff.text])
  if (diff.isBinary) return <p className={styles.notice}>Binary file — no text diff.</p>
  if (hunks.length === 0) return <p className={styles.notice}>No changes to show.</p>

  return (
    <div className={styles.code} role="table" aria-label="Diff">
      {hunks.map((hunk, hunkIndex) => (
        <div key={`${hunk.header}-${hunkIndex}`} role="rowgroup">
          <div className={styles.hunkHeader} role="row">
            {hunk.header}
          </div>
          {hunk.lines.map((line, index) => (
            <div key={index} className={styles.line} data-kind={line.kind} role="row">
              <span className={styles.number}>{line.oldLine ?? ''}</span>
              <span className={styles.number}>{line.newLine ?? ''}</span>
              <span className={styles.marker} aria-hidden>
                {MARKER[line.kind]}
              </span>
              <span className={styles.text}>{line.text}</span>
            </div>
          ))}
        </div>
      ))}
      {diff.isTruncated && <p className={styles.notice}>Diff truncated — file is very large.</p>}
    </div>
  )
}

export function DiffView({ diff, path, staged, onClose }: DiffViewProps) {
  return (
    <section className={styles.diff} aria-label={`Diff of ${path}`}>
      <header className={styles.header}>
        <span className={styles.path} title={path}>
          {path}
        </span>
        <span className={styles.badge}>{staged ? 'Staged' : 'Unstaged'}</span>
        <button className={styles.close} onClick={onClose} aria-label="Close diff">
          ×
        </button>
      </header>
      {diff ? <DiffBody diff={diff} /> : <p className={styles.notice}>Loading…</p>}
    </section>
  )
}
