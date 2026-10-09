import { MAX_INITIAL_PROMPT_LENGTH } from '@shared/ipc/contract'
import { deliverPrompt } from './deliverPrompt'
import { formatReviewPrompt } from './reviewPrompt'
import {
  useReviewCommentsStore,
  type CommentCheckout,
  type ReviewComment,
} from './reviewCommentsStore'

/** Shown when offering to resume an agent started with review comments. */
const SESSION_TITLE = 'Review comments'

/**
 * Delivers a checkout's comments as one prompt (see `deliverPrompt`). Delivered comments are
 * cleared. Resolves to an error to show, or null.
 */
export async function deliverComments(
  checkout: CommentCheckout,
  comments: readonly ReviewComment[],
): Promise<string | null> {
  if (comments.length === 0) return null
  const prompt = formatReviewPrompt(comments)
  if (prompt.length > MAX_INITIAL_PROMPT_LENGTH) {
    return 'These comments are too long to send at once. Send fewer, or shorten them.'
  }
  const error = await deliverPrompt(checkout, prompt, SESSION_TITLE)
  if (error) return error
  useReviewCommentsStore.getState().removeAll(comments.map((comment) => comment.id))
  return null
}
