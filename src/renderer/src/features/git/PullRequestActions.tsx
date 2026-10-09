import { useEffect } from 'react'
import { MessageSquareReply, Wrench } from 'lucide-react'
import type { PullRequestStatus } from '@shared/pullRequest'
import { AGENT_LABEL } from '@shared/terminal'
import type { GitCheckout } from '@shared/worktree'
import { useDelivery } from '@renderer/features/reviewComments/useDelivery'
import { useDefaultAgentStore } from '@renderer/features/start/defaultAgentStore'
import { Icon } from '@renderer/lib/Icon'
import { usePullRequestFeedback, type FeedbackKind } from './usePullRequestFeedback'
import styles from './PullRequestBlock.module.css'

interface PullRequestActionsProps {
  readonly checkout: GitCheckout
  readonly pullRequest: PullRequestStatus
}

/** Hands the PR's unresolved review comments or failing CI to the checkout's agent. */
export function PullRequestActions({ checkout, pullRequest }: PullRequestActionsProps) {
  const delivery = useDelivery({
    projectId: checkout.projectId,
    worktreePath: checkout.worktreePath ?? null,
  })
  const defaultAgent = useDefaultAgentStore((state) => state.defaultAgent)
  const loadDefaultAgent = useDefaultAgentStore((state) => state.load)
  const { state, send } = usePullRequestFeedback(checkout, pullRequest.number)

  useEffect(() => void loadDefaultAgent(), [loadDefaultAgent])

  const isBusy = delivery.kind === 'busy' || state.kind === 'loading'
  const target =
    delivery.kind === 'busy'
      ? delivery.reason
      : delivery.kind === 'start'
        ? `Starts ${AGENT_LABEL[defaultAgent]} on this checkout with them.`
        : 'Sends them to the agent working on this checkout.'
  const button = (feedback: FeedbackKind, label: string, what: string, icon: typeof Wrench) => (
    <button
      className={styles.action}
      disabled={isBusy}
      onClick={() => void send(feedback)}
      title={`${what} ${target}`}
    >
      <Icon icon={icon} />
      {state.kind === 'loading' && state.feedback === feedback ? 'Fetching…' : label}
    </button>
  )

  return (
    <div className={styles.actions}>
      {button(
        'review',
        'Address review comments',
        'Fetches the unresolved review comments.',
        MessageSquareReply,
      )}
      {pullRequest.checks.state === 'failing' &&
        button('ci', 'Fix failing CI', 'Fetches the failing checks and their logs.', Wrench)}
      {delivery.kind === 'busy' && <p className={styles.notice}>{delivery.reason}</p>}
      {state.kind === 'done' && (
        <p className={styles.notice} role="status">
          {state.message}
        </p>
      )}
      {state.kind === 'error' && (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      )}
    </div>
  )
}
