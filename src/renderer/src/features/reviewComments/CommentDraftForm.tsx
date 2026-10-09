import { useState, type KeyboardEvent } from 'react'
import { lineLabel } from './reviewPrompt'
import { useReviewCommentsStore, type CommentDraft } from './reviewCommentsStore'
import styles from './ReviewComments.module.css'

/** Long enough for real feedback; the whole prompt has its own limit. */
const MAX_COMMENT_LENGTH = 2_000

/** Writing a comment on the lines just picked in a diff. */
export function CommentDraftForm({ draft }: { draft: CommentDraft }) {
  const [text, setText] = useState('')
  const saveDraft = useReviewCommentsStore((state) => state.saveDraft)
  const cancelDraft = useReviewCommentsStore((state) => state.cancelDraft)
  const label = lineLabel(draft)

  // Enter adds the comment; Shift+Enter adds a line; Escape drops it.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') return cancelDraft()
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    saveDraft(text)
  }

  return (
    <form
      className={styles.draft}
      aria-label={`Comment on ${label}`}
      onSubmit={(event) => {
        event.preventDefault()
        saveDraft(text)
      }}
    >
      <span className={styles.location}>{label}</span>
      <pre className={styles.code}>{draft.code}</pre>
      <textarea
        className={styles.input}
        aria-label="Review comment"
        placeholder="What should the agent change here?"
        rows={2}
        maxLength={MAX_COMMENT_LENGTH}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.actions}>
        <span className={styles.hint}>↵ to add · ⇧↵ for a new line · esc to cancel</span>
        <button type="button" className={styles.secondary} onClick={cancelDraft}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={!text.trim()}>
          Add comment
        </button>
      </div>
    </form>
  )
}
