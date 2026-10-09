import { AGENT_LABEL } from '@shared/agents'
import type { ContextProposal } from '@shared/context'
import { Markdown } from '@renderer/features/tasks/markdown/Markdown'
import styles from './Context.module.css'

interface ProposalCardProps {
  readonly proposal: ContextProposal
  readonly isBusy: boolean
  onApprove(): void
  onDiscard(): void
}

/** A note an agent proposed, shown in full so the user can judge it before sharing. */
export function ProposalCard({ proposal, isBusy, onApprove, onDiscard }: ProposalCardProps) {
  const author = proposal.proposedBy ? AGENT_LABEL[proposal.proposedBy] : 'An agent'
  return (
    <li
      className={`${styles.card} ${styles.proposal}`}
      aria-label={`Proposed note ${proposal.title}`}
    >
      <div className={styles.cardHead}>
        <span className={styles.title}>{proposal.title}</span>
        <span className={styles.badge}>Proposed by {author}</span>
      </div>
      <div className={styles.body}>
        <Markdown text={proposal.body} />
      </div>
      <div className={styles.actions}>
        <button className={styles.primary} onClick={onApprove} disabled={isBusy}>
          Approve and share
        </button>
        <button onClick={onDiscard} disabled={isBusy}>
          Discard
        </button>
      </div>
    </li>
  )
}
