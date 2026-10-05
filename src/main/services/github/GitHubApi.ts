import type { GitHubAccount, GitHubRepo } from '@shared/github'

export interface GitHubApiDeps {
  readonly fetch: typeof globalThis.fetch
  readonly apiBaseUrl: string
}

export class GitHubUnauthorizedError extends Error {
  override readonly name = 'GitHubUnauthorizedError'
  constructor() {
    super('Your GitHub sign-in has expired. Please sign in again.')
  }
}

const PAGE_SIZE = 100
const MAX_PAGES = 5

interface RepoResponse {
  name: string
  full_name: string
  owner: { login: string }
  description: string | null
  private: boolean
  clone_url: string
  pushed_at: string | null
}

/** The few GitHub REST endpoints Dugout uses. */
export class GitHubApi {
  constructor(private readonly deps: GitHubApiDeps) {}

  async getUser(token: string): Promise<GitHubAccount> {
    const user = await this.get<{ login: string; name: string | null; avatar_url: string }>(
      '/user',
      token,
    )
    return { login: user.login, name: user.name, avatarUrl: user.avatar_url }
  }

  /** Repositories the user can access, most recently pushed first. */
  async listRepos(token: string): Promise<GitHubRepo[]> {
    const repos: GitHubRepo[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({
        sort: 'pushed',
        per_page: String(PAGE_SIZE),
        page: String(page),
        affiliation: 'owner,collaborator,organization_member',
      })
      const batch = await this.get<RepoResponse[]>(`/user/repos?${query.toString()}`, token)
      repos.push(...batch.map(toRepo))
      if (batch.length < PAGE_SIZE) break
    }
    return repos
  }

  private async get<T>(path: string, token: string): Promise<T> {
    const response = await this.deps.fetch(`${this.deps.apiBaseUrl}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    })
    if (response.status === 401) throw new GitHubUnauthorizedError()
    if (!response.ok) throw new Error(`GitHub request failed (HTTP ${response.status}).`)
    return (await response.json()) as T
  }
}

function toRepo(repo: RepoResponse): GitHubRepo {
  return {
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    description: repo.description,
    isPrivate: repo.private,
    cloneUrl: repo.clone_url,
    pushedAt: repo.pushed_at,
  }
}
