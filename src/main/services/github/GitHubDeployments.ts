import { toWebUrl, type DeploymentState, type PreviewDeployment } from '@shared/preview'
import type { GitHubRepoRef } from '../tasks/githubRepo'
import {
  GitHubUnauthorizedError,
  githubJson,
  githubRequest,
  type GitHubRestDeps,
} from './GitHubApi'

interface DeploymentResponse {
  id: number
  environment: string
}

interface DeploymentStatusResponse {
  state: string
  environment_url?: string | null
  target_url?: string | null
}

/** How many of a branch's newest deployments to look through for one that is ready. */
const MAX_DEPLOYMENTS = 5
const NOT_FOUND = 404
const UNAUTHORIZED = 401

const STATE: Readonly<Record<string, DeploymentState>> = {
  success: 'ready',
  pending: 'pending',
  queued: 'pending',
  in_progress: 'pending',
  error: 'failed',
  failure: 'failed',
}

/** A deployment with no status yet has only just been created. Inactive ones were replaced. */
function toState(status: DeploymentStatusResponse | undefined): DeploymentState | null {
  if (!status) return 'pending'
  return STATE[status.state] ?? null
}

function deploymentUrl(status: DeploymentStatusResponse | undefined): string | null {
  const raw = status?.environment_url || status?.target_url
  return raw ? toWebUrl(raw) : null
}

/** A branch's preview deployment, from GitHub deployments and their statuses. */
export class GitHubDeployments {
  constructor(private readonly deps: GitHubRestDeps) {}

  /**
   * Deployments are matched by the branch name (Netlify and most Actions) or, when none use it,
   * by the commit the branch points to on GitHub (providers that deploy by SHA). The state is
   * the newest deployment's; the URL is the newest ready one's.
   */
  async forBranch(
    token: string,
    repo: GitHubRepoRef,
    branch: string,
  ): Promise<PreviewDeployment | null> {
    const base = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
    const byRef = await this.list(token, base, { ref: branch })
    const deployments = byRef.length > 0 ? byRef : await this.byBranchHead(token, base, branch)

    let latest: Omit<PreviewDeployment, 'url'> | null = null
    for (const deployment of deployments) {
      const [status] = await githubJson<DeploymentStatusResponse[]>(
        this.deps,
        token,
        'GET',
        `${base}/deployments/${deployment.id}/statuses?per_page=1`,
      )
      const state = toState(status)
      if (state === null) continue
      latest ??= { environment: deployment.environment, state }
      const url = state === 'ready' ? deploymentUrl(status) : null
      if (url) return { ...latest, url }
    }
    return latest && { ...latest, url: null }
  }

  private list(
    token: string,
    base: string,
    filter: { ref: string } | { sha: string },
  ): Promise<DeploymentResponse[]> {
    const query = new URLSearchParams({ ...filter, per_page: String(MAX_DEPLOYMENTS) })
    return githubJson<DeploymentResponse[]>(this.deps, token, 'GET', `${base}/deployments?${query}`)
  }

  /** Deployments of the commit the branch points to on GitHub; none if it is not pushed. */
  private async byBranchHead(
    token: string,
    base: string,
    branch: string,
  ): Promise<DeploymentResponse[]> {
    const name = branch.split('/').map(encodeURIComponent).join('/')
    const response = await githubRequest(this.deps, token, 'GET', `${base}/branches/${name}`)
    if (response.status === NOT_FOUND) return []
    if (response.status === UNAUTHORIZED) throw new GitHubUnauthorizedError()
    if (!response.ok) throw new Error(`GitHub: request failed (HTTP ${response.status})`)
    const head = (await response.json()) as { commit: { sha: string } }
    return this.list(token, base, { sha: head.commit.sha })
  }
}
