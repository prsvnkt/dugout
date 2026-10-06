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

/** GitHub could not be reached (offline, DNS, timeout) or answered with a server error. */
export class GitHubUnavailableError extends Error {
  override readonly name = 'GitHubUnavailableError'
  constructor() {
    super('Can’t reach GitHub right now.')
  }
}

const SERVER_ERROR = 500

/** fetch, with network failures and GitHub 5xx responses reported as GitHubUnavailableError. */
export async function fetchGitHub(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetchImpl(url, init).catch(() => {
    throw new GitHubUnavailableError()
  })
  if (response.status >= SERVER_ERROR) throw new GitHubUnavailableError()
  return response
}

export interface GitHubRestDeps {
  readonly fetch: typeof globalThis.fetch
  readonly apiBaseUrl: string
}

/** An authenticated GitHub REST request (raw response, for callers that inspect the status). */
export function githubRequest(
  deps: GitHubRestDeps,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetchGitHub(deps.fetch, `${deps.apiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

/** An authenticated GitHub REST request returning JSON; 401 → GitHubUnauthorizedError. */
export async function githubJson<T>(
  deps: GitHubRestDeps,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await githubRequest(deps, token, method, path, body)
  if (response.status === 401) throw new GitHubUnauthorizedError()
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(`GitHub: ${detail?.message ?? `request failed (HTTP ${response.status})`}`)
  }
  return (await response.json()) as T
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
    const response = await fetchGitHub(this.deps.fetch, `${this.deps.apiBaseUrl}${path}`, {
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
