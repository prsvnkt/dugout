import { useState } from 'react'
import { MAX_INITIAL_PROMPT_LENGTH } from '@shared/ipc/contract'
import type { FailingCheck, PullReviewThread } from '@shared/pullRequest'
import type { Result } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'
import { deliverPrompt } from '@renderer/features/reviewComments/deliverPrompt'
import { dugout } from '@renderer/lib/dugout'
import { formatFailingChecksPrompt, formatReviewThreadsPrompt } from './pullRequestPrompt'

export type FeedbackKind = 'review' | 'ci'

/** What the last "hand it to an agent" action did, shown under the buttons. */
export type FeedbackState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly feedback: FeedbackKind }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string }

interface FeedbackSource<T> {
  readonly load: (checkout: GitCheckout, pullNumber: number) => Promise<Result<readonly T[]>>
  readonly format: (pullNumber: number, items: readonly T[], maxLength: number) => string
  readonly none: string
  readonly sent: (count: number) => string
  /** Names the session when an agent is started with it (offered for resume later). */
  readonly sessionTitle: string
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

const REVIEW: FeedbackSource<PullReviewThread> = {
  load: (checkout, pullNumber) => dugout.git.pullRequestReviewThreads(checkout, pullNumber),
  format: formatReviewThreadsPrompt,
  none: 'No unresolved review comments.',
  sent: (count) => `Sent ${plural(count, 'unresolved review thread')} to the agent.`,
  sessionTitle: 'PR review comments',
}

const CI: FeedbackSource<FailingCheck> = {
  load: (checkout, pullNumber) => dugout.git.pullRequestFailingChecks(checkout, pullNumber),
  format: formatFailingChecksPrompt,
  none: 'No checks are failing right now.',
  sent: (count) => `Sent ${plural(count, 'failing check')} to the agent.`,
  sessionTitle: 'Fix failing CI',
}

async function handOver<T>(
  source: FeedbackSource<T>,
  checkout: GitCheckout,
  pullNumber: number,
): Promise<FeedbackState> {
  const result = await source.load(checkout, pullNumber)
  if (!result.ok) return { kind: 'error', message: result.error }
  if (result.data.length === 0) return { kind: 'done', message: source.none }
  const prompt = source.format(pullNumber, result.data, MAX_INITIAL_PROMPT_LENGTH)
  const target = { projectId: checkout.projectId, worktreePath: checkout.worktreePath ?? null }
  const error = await deliverPrompt(target, prompt, source.sessionTitle)
  return error
    ? { kind: 'error', message: error }
    : { kind: 'done', message: source.sent(result.data.length) }
}

/**
 * Fetches a pull request's unresolved review comments or failing checks and hands them to the
 * checkout's agent as one prompt (or starts the default agent with it).
 */
export function usePullRequestFeedback(checkout: GitCheckout, pullNumber: number) {
  const [state, setState] = useState<FeedbackState>({ kind: 'idle' })

  const send = async (feedback: FeedbackKind) => {
    setState({ kind: 'loading', feedback })
    setState(
      feedback === 'review'
        ? await handOver(REVIEW, checkout, pullNumber)
        : await handOver(CI, checkout, pullNumber),
    )
  }

  return { state, send }
}
