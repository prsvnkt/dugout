import { useEffect, useState } from 'react'
import type { GitChangeKind } from '@shared/git'
import { CHANGE_LETTER, splitPath } from './changeKind'
import styles from './GitPanel.module.css'

interface FileRowProps {
  readonly path: string
  readonly kind: GitChangeKind
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

export function FileRow(props: FileRowProps) {
  const { path, kind, isSelected, isBusy, onSelect, onStage, onUnstage, onDiscard } = props
  const { name, dir } = splitPath(path)
  const discard = useConfirm(onDiscard)

  return (
    <li className={styles.fileRow} data-selected={isSelected}>
      <button
        className={styles.fileButton}
        onClick={onSelect}
        title={path}
        aria-label={`Open diff of ${path} (${kind})`}
      >
        <span className={styles.changeLetter} data-kind={kind} aria-hidden>
          {CHANGE_LETTER[kind]}
        </span>
        <span className={styles.fileName}>{name}</span>
        {dir && <span className={styles.fileDir}>{dir}</span>}
      </button>
      <span className={styles.rowActions}>
        {onDiscard && (
          <button
            className={styles.rowAction}
            data-armed={discard.isArmed}
            onClick={discard.trigger}
            disabled={isBusy}
            aria-label={discard.isArmed ? `Confirm discard ${path}` : `Discard changes to ${path}`}
            title={discard.isArmed ? 'Click again to discard' : 'Discard changes'}
          >
            {discard.isArmed ? 'Discard?' : '↺'}
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
            +
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
            −
          </button>
        )}
      </span>
    </li>
  )
}
