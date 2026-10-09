import { useEffect, useState } from 'react'
import { Minus, Plus, Undo2 } from 'lucide-react'
import type { GitChangeKind, GitLineStats } from '@shared/git'
import { CHANGE_LETTER, splitPath } from './changeKind'
import { FileTypeIcon } from '@renderer/features/explorer/FileTypeIcon'
import { Icon } from '@renderer/lib/Icon'
import { diffBar } from './diffBar'
import styles from './GitPanel.module.css'

interface FileRowProps {
  readonly path: string
  readonly kind: GitChangeKind
  readonly stats: GitLineStats | null
  readonly isSelected: boolean
  readonly isBusy: boolean
  onSelect(): void
  onStage?(): void
  onUnstage?(): void
  onDiscard?(): void
}

const CONFIRM_WINDOW_MS = 3_000

/** Discard needs a second click within a few seconds; it cannot be undone. */
function useConfirm(action: (() => void) | undefined) {
  const [isArmed, setIsArmed] = useState(false)
  useEffect(() => {
    if (!isArmed) return
    const timer = window.setTimeout(() => setIsArmed(false), CONFIRM_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [isArmed])
  const trigger = () => {
    if (isArmed) action?.()
    setIsArmed(!isArmed)
  }
  return { isArmed, trigger }
}

/** "12 added, 3 removed", for screen readers and tooltips. */
function describeStats(stats: GitLineStats): string {
  if (stats.kind === 'binary') return 'binary file'
  return `${stats.additions} added, ${stats.deletions} removed`
}

/** "+12 −3" and a small green/red bar sized by how much changed. */
function DiffStats({ stats }: { stats: GitLineStats }) {
  const bar = diffBar(stats)
  return (
    <span className={styles.stats} title={describeStats(stats)} aria-hidden>
      {stats.kind === 'binary' ? (
        <span className={styles.binary}>bin</span>
      ) : (
        <span className={styles.counts}>
          {stats.additions > 0 && <span className={styles.added}>+{stats.additions}</span>}
          {stats.deletions > 0 && <span className={styles.removed}>−{stats.deletions}</span>}
        </span>
      )}
      <span className={styles.bar}>
        <span className={styles.barAdded} style={{ width: bar.added }} />
        <span className={styles.barRemoved} style={{ width: bar.removed }} />
      </span>
    </span>
  )
}

export function FileRow(props: FileRowProps) {
  const { path, kind, stats, isSelected, isBusy, onSelect, onStage, onUnstage, onDiscard } = props
  const { name, dir } = splitPath(path)
  const discard = useConfirm(onDiscard)

  return (
    <li className={styles.fileRow} data-selected={isSelected}>
      <button
        className={styles.fileButton}
        onClick={onSelect}
        title={path}
        aria-label={`Open diff of ${path} (${kind}${stats ? `, ${describeStats(stats)}` : ''})`}
      >
        <FileTypeIcon name={name} />
        <span className={styles.fileName}>{name}</span>
        {dir && <span className={styles.fileDir}>{dir}</span>}
      </button>
      <span className={styles.rowEnd}>
        {stats && <DiffStats stats={stats} />}
        <span className={styles.rowActions}>
          {onDiscard && (
            <button
              className={styles.rowAction}
              data-armed={discard.isArmed}
              onClick={discard.trigger}
              disabled={isBusy}
              aria-label={
                discard.isArmed ? `Confirm discard ${path}` : `Discard changes to ${path}`
              }
              title={discard.isArmed ? 'Click again to discard' : 'Discard changes'}
            >
              {discard.isArmed ? 'Discard?' : <Icon icon={Undo2} />}
            </button>
          )}
          {onStage && (
            <button
              className={styles.rowAction}
              onClick={onStage}
              disabled={isBusy}
              aria-label={`Stage ${path}`}
              title="Stage"
            >
              <Icon icon={Plus} />
            </button>
          )}
          {onUnstage && (
            <button
              className={styles.rowAction}
              onClick={onUnstage}
              disabled={isBusy}
              aria-label={`Unstage ${path}`}
              title="Unstage"
            >
              <Icon icon={Minus} />
            </button>
          )}
        </span>
      </span>
      <span className={styles.changeLetter} data-kind={kind} aria-hidden>
        {CHANGE_LETTER[kind]}
      </span>
    </li>
  )
}
