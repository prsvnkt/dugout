import { useState, type KeyboardEvent } from 'react'
import styles from './GitPanel.module.css'

interface CommitBoxProps {
  readonly stagedCount: number
  readonly isBusy: boolean
  onCommit(message: string): Promise<boolean>
}

export function CommitBox({ stagedCount, isBusy, onCommit }: CommitBoxProps) {
  const [message, setMessage] = useState('')
  const canCommit = stagedCount > 0 && message.trim().length > 0 && !isBusy

  const commit = async () => {
    if (!canCommit) return
    if (await onCommit(message)) setMessage('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      void commit()
    }
  }

  return (
    <div className={styles.commitBox}>
      <textarea
        className={styles.commitInput}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Commit message (⌘↵ to commit)"
        aria-label="Commit message"
        rows={3}
      />
      <button className={styles.commitButton} onClick={() => void commit()} disabled={!canCommit}>
        {stagedCount > 0 ? `Commit ${stagedCount} staged` : 'Nothing staged'}
      </button>
    </div>
  )
}
