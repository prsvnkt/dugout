import type { FailingCheck, PullReviewThread } from '@shared/pullRequest'
import type { GitHubRepoRef } from '../tasks/githubRepo'
import {
  githubJson,
  githubRequest,
  GitHubUnauthorizedError,
  type GitHubRestDeps,
} from './GitHubApi'
import { isFailed } from './GitHubPulls'
import {
  checkAnnotations,
  logTail,
  REVIEW_THREADS_QUERY,
  unresolvedThreads,
  type AnnotationResponse,
  type ReviewThreadsResponse,
} from './pullFeedback'

interface CheckRunResponse {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string | null
  output: { title: string | null; summary: string | null } | null
  app: { slug: string } | null
}

interface StatusResponse {
  context: string
  state: string
  description: string | null
  target_url: string | null
}

/** Details (annotations, log) are fetched for this many failing runs; the rest are named only. */
export const MAX_DETAILED_CHECKS = 5
const MAX_SUMMARY_LENGTH = 2_000

function clip(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim()
  if (!trimmed) return null
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

/** Optional detail: a failure to fetch it leaves it out, but an expired sign-in still counts. */
async function optional<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (error instanceof GitHubUnauthorizedError) throw error
    return fallback
  }
}

/** What a pull request's reviewers and CI want changed, for handing to an agent. */
export class GitHubPullFeedback {
  constructor(private readonly deps: GitHubRestDeps) {}

  async reviewThreads(
    token: string,
    repo: GitHubRepoRef,
    number: number,
  ): Promise<PullReviewThread[]> {
    const response = await githubJson<ReviewThreadsResponse>(this.deps, token, 'POST', '/graphql', {
      query: REVIEW_THREADS_QUERY,
      variables: { owner: repo.owner, name: repo.name, number },
    })
    return unresolvedThreads(response)
  }

  async failingChecks(token: string, repo: GitHubRepoRef, number: number): Promise<FailingCheck[]> {
    const base = repoPath(repo)
    const pull = await githubJson<{ head: { sha: string } }>(
      this.deps,
      token,
      'GET',
      `${base}/pulls/${number}`,
    )
    const sha = encodeURIComponent(pull.head.sha)
    const [checkRuns, status] = await Promise.all([
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
    const failingRuns = checkRuns.check_runs.filter(
      (run) => run.status === 'completed' && isFailed(run.conclusion),
    )
    const detailed = await Promise.all(
      failingRuns.map((run, index) =>
        index < MAX_DETAILED_CHECKS ? this.details(token, base, run) : Promise.resolve(brief(run)),
      ),
    )
    const statuses = status.statuses
      .filter((entry) => isFailed(entry.state))
      .map((entry): FailingCheck => ({
        name: entry.context,
        url: entry.target_url,
        title: clip(entry.description, MAX_SUMMARY_LENGTH),
        summary: null,
        annotations: [],
        logTail: null,
      }))
    return [...detailed, ...statuses]
  }

  private async details(token: string, base: string, run: CheckRunResponse): Promise<FailingCheck> {
    const [annotations, log] = await Promise.all([
      optional(
        () =>
          githubJson<AnnotationResponse[]>(
            this.deps,
            token,
            'GET',
            `${base}/check-runs/${run.id}/annotations?per_page=50`,
          ),
        [],
      ),
      run.app?.slug === 'github-actions'
        ? optional(() => this.jobLog(token, base, run.id), null)
        : Promise.resolve(null),
    ])
    return {
      ...brief(run),
      annotations: checkAnnotations(annotations),
      logTail: log === null ? null : logTail(log),
    }
  }

  /** An Actions job's log (the check run id is the job id); null once GitHub has expired it. */
  private async jobLog(token: string, base: string, jobId: number): Promise<string | null> {
    const response = await githubRequest(
      this.deps,
      token,
      'GET',
      `${base}/actions/jobs/${jobId}/logs`,
    )
    if (response.status === 401) throw new GitHubUnauthorizedError()
    return response.ok ? response.text() : null
  }
}

function repoPath(repo: GitHubRepoRef): string {
  return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
}

function brief(run: CheckRunResponse): FailingCheck {
  return {
    name: run.name,
    url: run.html_url,
    title: clip(run.output?.title, MAX_SUMMARY_LENGTH),
    summary: clip(run.output?.summary, MAX_SUMMARY_LENGTH),
    annotations: [],
    logTail: null,
  }
}
