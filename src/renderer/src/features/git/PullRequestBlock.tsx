import { useState } from 'react'
import type { PullRequestStatus, ReviewState } from '@shared/pullRequest'
import { dugout } from '@renderer/lib/dugout'
import styles from './PullRequestBlock.module.css'

const STATE_LABEL = { open: 'Open', draft: 'Draft', merged: 'Merged', closed: 'Closed' } as const
const REVIEW_LABEL: Readonly<Record<ReviewState, string | null>> = {
  approved: '✓ Approved',
  'changes-requested': '✕ Changes requested',
  none: null,
}
const CHECK_MARK = { passing: '✓', failing: '✕', pending: '●', skipped: '–' } as const

function checksLabel(pr: PullRequestStatus): string {
  const { state, passed, total } = pr.checks
  if (state === 'none') return 'No checks'
  const failing = pr.checks.runs.filter((run) => run.state === 'failing').length
  const pending = pr.checks.runs.filter((run) => run.state === 'pending').length
  const suffix = failing > 0 ? ` (${failing} failing)` : pending > 0 ? ` (${pending} running)` : ''
  return `Checks ${passed}/${total}${suffix}`
}

/** The branch's pull request: state, review decision and CI checks, with links to GitHub. */
export function PullRequestBlock({ pullRequest }: { pullRequest: PullRequestStatus }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const open = (url: string) => void dugout.git.openUrl(url)
  const review = REVIEW_LABEL[pullRequest.review]

  return (
    <section className={styles.block} aria-label="Pull request">
      <button className={styles.title} onClick={() => open(pullRequest.url)} title="Open on GitHub">
        <span className={styles.number}>#{pullRequest.number}</span> {pullRequest.title}
      </button>
      <div className={styles.meta}>
        <span className={styles.badge} data-state={pullRequest.state}>
          {STATE_LABEL[pullRequest.state]}
        </span>
        {review && (
          <span className={styles.review} data-review={pullRequest.review}>
            {review}
          </span>
        )}
        <button
          className={styles.checks}
          data-checks={pullRequest.checks.state}
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          disabled={pullRequest.checks.total === 0 && pullRequest.checks.runs.length === 0}
        >
          {checksLabel(pullRequest)}
        </button>
      </div>
      {isExpanded && (
        <ul className={styles.runs} aria-label="Checks">
          {pullRequest.checks.runs.map((run, index) => (
            <li key={`${run.name}-${index}`}>
              <button
                className={styles.run}
                data-state={run.state}
                disabled={!run.url}
                onClick={() => run.url && open(run.url)}
              >
                <span aria-hidden>{CHECK_MARK[run.state]}</span> {run.name}
                <span className={styles.runState}>{run.state}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
