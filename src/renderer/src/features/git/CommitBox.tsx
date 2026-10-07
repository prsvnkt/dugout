import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { useDismiss } from '@renderer/lib/useDismiss'
import { commitPlan } from './commitPlan'
import type { CommitOptions } from './gitStore'
import styles from './GitPanel.module.css'

interface CommitBoxProps {
  readonly stagedCount: number
  readonly unstagedCount: number
  /** The branch commits land on, shown in the placeholder like VS Code. */
  readonly branch: string | null
  readonly isBusy: boolean
  onCommit(message: string, options: CommitOptions): Promise<boolean>
}

interface CommitMenuProps {
  readonly disabled: boolean
  onChoose(andPush: boolean): void
}

/** ⌄ next to Commit: commit, or commit and push in one go. */
function CommitMenu({ disabled, onChoose }: CommitMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(wrapRef, isOpen, close)
  const choose = (andPush: boolean) => {
    close()
    onChoose(andPush)
  }

  return (
    <div className={styles.commitMenuWrap} ref={wrapRef}>
      <button
        className={styles.commitMore}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="More commit actions"
        title="More commit actions"
      >
        <span aria-hidden>⌄</span>
      </button>
      {isOpen && (
        <div className={styles.commitMenu} role="menu">
          <button role="menuitem" onClick={() => choose(false)}>
            Commit
          </button>
          <button role="menuitem" onClick={() => choose(true)}>
            Commit &amp; Push
          </button>
        </div>
      )}
    </div>
  )
}

/** VS Code-style commit area: message, then a full-width Commit button with a ⌄ menu. */
export function CommitBox(props: CommitBoxProps) {
  const { stagedCount, unstagedCount, branch, isBusy, onCommit } = props
  const [message, setMessage] = useState('')
  const plan = commitPlan({ stagedCount, unstagedCount, message })
  const canCommit = plan.canCommit && !isBusy

  const commit = async (andPush: boolean) => {
    if (!canCommit) return
    if (await onCommit(message, { includeAll: plan.includeAll, andPush })) setMessage('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      void commit(false)
    }
  }

  return (
    <div className={styles.commitBox}>
      <textarea
        className={styles.commitInput}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Message (⌘↵ to commit on "${branch ?? 'HEAD'}")`}
        aria-label="Commit message"
        rows={1}
      />
      <div className={styles.commitButtons}>
        <button
          className={styles.commitButton}
          onClick={() => void commit(false)}
          disabled={!canCommit}
          aria-label={plan.description}
          title={plan.description}
        >
          <span aria-hidden>✓</span> {plan.label}
        </button>
        <CommitMenu disabled={!canCommit} onChoose={(andPush) => void commit(andPush)} />
      </div>
    </div>
  )
}
