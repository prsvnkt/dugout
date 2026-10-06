import type {
  CheckRun,
  CheckState,
  ChecksSummary,
  PullRequestState,
  PullRequestStatus,
  ReviewState,
} from '@shared/pullRequest'
import type { GitHubRepoRef } from '../tasks/githubRepo'
import { githubJson, type GitHubRestDeps } from './GitHubApi'

interface PullResponse {
  number: number
  title: string
  html_url: string
  state: string
  draft: boolean
  merged_at: string | null
  head: { sha: string }
}

interface ReviewResponse {
  user: { login: string } | null
  state: string
}

interface CheckRunResponse {
  name: string
  status: string
  conclusion: string | null
  html_url: string | null
}

interface StatusResponse {
  context: string
  state: string
  target_url: string | null
}

const FAILED = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'error',
])
const STATE_ORDER: readonly CheckState[] = ['failing', 'pending', 'passing', 'skipped']

function pullState(pull: PullResponse): PullRequestState {
  if (pull.merged_at) return 'merged'
  if (pull.state === 'closed') return 'closed'
  return pull.draft ? 'draft' : 'open'
}

/** GitHub's rule of thumb: each reviewer's latest decisive review counts; any change request wins. */
function reviewDecision(reviews: readonly ReviewResponse[]): ReviewState {
  const latest = new Map<string, string>()
  for (const review of reviews) {
    if (review.user && ['APPROVED', 'CHANGES_REQUESTED'].includes(review.state)) {
      latest.set(review.user.login, review.state)
    }
  }
  const decisions = [...latest.values()]
  if (decisions.includes('CHANGES_REQUESTED')) return 'changes-requested'
  return decisions.includes('APPROVED') ? 'approved' : 'none'
}

function runState(run: CheckRunResponse): CheckState {
  if (run.status !== 'completed') return 'pending'
  if (run.conclusion === 'skipped') return 'skipped'
  return run.conclusion && FAILED.has(run.conclusion) ? 'failing' : 'passing'
}

function statusState(status: StatusResponse): CheckState {
  if (status.state === 'pending') return 'pending'
  return FAILED.has(status.state) ? 'failing' : 'passing'
}

function summarise(runs: CheckRun[]): ChecksSummary {
  const counted = runs.filter((run) => run.state !== 'skipped')
  const sorted = [...runs].sort(
    (a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state),
  )
  const has = (state: CheckState) => counted.some((run) => run.state === state)
  const state =
    counted.length === 0
      ? 'none'
      : has('failing')
        ? 'failing'
        : has('pending')
          ? 'pending'
          : 'passing'
  return {
    state,
    passed: counted.filter((run) => run.state === 'passing').length,
    total: counted.length,
    runs: sorted,
  }
}

/** The pull request of a branch, with its review decision and CI checks. */
export class GitHubPulls {
  constructor(private readonly deps: GitHubRestDeps) {}

  async forBranch(
    token: string,
    repo: GitHubRepoRef,
    branch: string,
  ): Promise<PullRequestStatus | null> {
    const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
    const query = new URLSearchParams({
      head: `${repo.owner}:${branch}`,
      state: 'all',
      per_page: '1',
    })
    const [pull] = await githubJson<PullResponse[]>(
      this.deps,
      token,
      'GET',
      `${base}/pulls?${query}`,
    )
    if (!pull) return null

    const sha = encodeURIComponent(pull.head.sha)
    const [reviews, checkRuns, statuses] = await Promise.all([
      githubJson<ReviewResponse[]>(
        this.deps,
        token,
        'GET',
        `${base}/pulls/${pull.number}/reviews?per_page=100`,
      ),
      githubJson<{ check_runs: CheckRunResponse[] }>(
        this.deps,
        token,
        'GET',
        `${base}/commits/${sha}/check-runs?per_page=100`,
      ),
      githubJson<{ statuses: StatusResponse[] }>(
        this.deps,
        token,
        'GET',
        `${base}/commits/${sha}/status`,
      ),
    ])
    const runs: CheckRun[] = [
      ...checkRuns.check_runs.map((run) => ({
        name: run.name,
        state: runState(run),
        url: run.html_url,
      })),
      ...statuses.statuses.map((status) => ({
        name: status.context,
        state: statusState(status),
        url: status.target_url,
      })),
    ]
    return {
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      state: pullState(pull),
      review: reviewDecision(reviews),
      checks: summarise(runs),
    }
  }
}
