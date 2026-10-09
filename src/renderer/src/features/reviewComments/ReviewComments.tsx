import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { AGENT_LABEL } from '@shared/terminal'
import { useDefaultAgentStore } from '@renderer/features/start/defaultAgentStore'
import { Icon } from '@renderer/lib/Icon'
import { CommentDraftForm } from './CommentDraftForm'
import { deliverComments } from './deliverComments'
import { useDelivery } from './useDelivery'
import { lineLabel } from './reviewPrompt'
import {
  isSameCheckout,
  useReviewCommentsStore,
  type CommentCheckout,
  type ReviewComment,
} from './reviewCommentsStore'
import styles from './ReviewComments.module.css'

/** A checkout whose comments this panel shows, e.g. one side of a Compare. */
export interface CommentTarget {
  readonly checkout: CommentCheckout
  /** Names the checkout when the panel shows more than one (e.g. "Claude"). */
  readonly label: string | null
}

function CommentRow({ comment }: { comment: ReviewComment }) {
  const remove = useReviewCommentsStore((state) => state.remove)
  const label = lineLabel(comment)
  return (
    <li className={styles.comment}>
      <span className={styles.location}>{label}</span>
      <span className={styles.text}>{comment.text}</span>
      <button
        className={styles.iconButton}
        onClick={() => remove(comment.id)}
        aria-label={`Remove comment on ${label}`}
        title="Remove comment"
      >
        <Icon icon={Trash2} />
      </button>
    </li>
  )
}

function PendingGroup({
  target,
  comments,
}: {
  target: CommentTarget
  comments: readonly ReviewComment[]
}) {
  const delivery = useDelivery(target.checkout)
  const defaultAgent = useDefaultAgentStore((state) => state.defaultAgent)
  const loadDefaultAgent = useDefaultAgentStore((state) => state.load)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => void loadDefaultAgent(), [loadDefaultAgent])

  const send = async () => {
    setIsSending(true)
    setError(await deliverComments(target.checkout, comments))
    setIsSending(false)
  }
  const count = `${comments.length} comment${comments.length === 1 ? '' : 's'}`
  const note =
    delivery.kind === 'busy'
      ? delivery.reason
      : delivery.kind === 'start'
        ? 'No agent is open on this checkout.'
        : null

  return (
    <div className={styles.group}>
      <header className={styles.groupHeader}>
        <span className={styles.count}>{target.label ? `${target.label}: ${count}` : count}</span>
        {note && <span className={styles.note}>{note}</span>}
        <button
          className={styles.primary}
          disabled={delivery.kind === 'busy' || isSending}
          onClick={() => void send()}
        >
          {delivery.kind === 'start'
            ? `Start ${AGENT_LABEL[defaultAgent]} with comments`
            : 'Send to agent'}
        </button>
      </header>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {comments.map((comment) => (
          <CommentRow key={comment.id} comment={comment} />
        ))}
      </ul>
    </div>
  )
}

/**
 * Review comments under a diff: the one being written, and the pending ones per checkout,
 * each sent to that checkout's agent as one prompt.
 */
export function ReviewComments({
  targets,
  hint,
}: {
  targets: readonly CommentTarget[]
  hint: string
}) {
  const allComments = useReviewCommentsStore((state) => state.comments)
  const draft = useReviewCommentsStore((state) => state.draft)
  const groups = useMemo(
    () =>
      targets
        .map((target) => ({
          target,
          comments: allComments.filter((comment) => isSameCheckout(comment, target.checkout)),
        }))
        .filter((group) => group.comments.length > 0),
    [targets, allComments],
  )
  const isDraftHere = draft !== null && targets.some((t) => isSameCheckout(draft, t.checkout))

  return (
    <section className={styles.panel} aria-label="Review comments">
      {isDraftHere && <CommentDraftForm key={`${draft.path}:${draft.startLine}`} draft={draft} />}
      {groups.map(({ target, comments }) => (
        <PendingGroup
          key={target.checkout.worktreePath ?? ''}
          target={target}
          comments={comments}
        />
      ))}
      {!isDraftHere && groups.length === 0 && <p className={styles.hint}>{hint}</p>}
    </section>
  )
}
