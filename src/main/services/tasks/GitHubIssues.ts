import type { Task, TaskDetail, TaskStatus } from '@shared/tasks'
import { fetchGitHub, GitHubUnauthorizedError } from '../github/GitHubApi'
import type { GitHubRepoRef } from './githubRepo'
import { labelsForStatus, STATUS_LABEL_COLORS, STATUS_LABELS, statusOf } from './taskStatus'

export interface GitHubIssuesDeps {
  readonly fetch: typeof globalThis.fetch
  readonly apiBaseUrl: string
}

export interface TaskPatch {
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly status?: TaskStatus | undefined
}

interface IssueResponse {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  user: { login: string } | null
  labels: (string | { name?: string })[]
  comments: number
  updated_at: string
  pull_request?: unknown
}

interface CommentResponse {
  user: { login: string } | null
  body: string | null
  created_at: string
}

const PAGE_SIZE = 100
const MAX_PAGES = 3
const NOT_FOUND = 404

function labelNames(issue: IssueResponse): string[] {
  return issue.labels
    .map((label) => (typeof label === 'string' ? label : label.name))
    .filter((name): name is string => Boolean(name))
}

function toTask(issue: IssueResponse): Task {
  const labels = labelNames(issue)
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    status: statusOf(issue.state, labels),
    url: issue.html_url,
    author: issue.user?.login ?? 'unknown',
    labels,
    commentCount: issue.comments,
    updatedAt: issue.updated_at,
  }
}

/** Project tasks stored as GitHub Issues, with Dugout status labels. */
export class GitHubIssues {
  constructor(private readonly deps: GitHubIssuesDeps) {}

  /** Open and recently closed issues (pull requests excluded), most recently updated first. */
  async list(token: string, repo: GitHubRepoRef): Promise<Task[]> {
    const tasks: Task[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({
        state: 'all',
        sort: 'updated',
        per_page: String(PAGE_SIZE),
        page: String(page),
      })
      const batch = await this.request<IssueResponse[]>(
        token,
        'GET',
        `${this.base(repo)}/issues?${query}`,
      )
      tasks.push(...batch.filter((issue) => issue.pull_request === undefined).map(toTask))
      if (batch.length < PAGE_SIZE) break
    }
    return tasks
  }

  async get(token: string, repo: GitHubRepoRef, number: number): Promise<TaskDetail> {
    const [issue, comments] = await Promise.all([
      this.request<IssueResponse>(token, 'GET', `${this.base(repo)}/issues/${number}`),
      this.request<CommentResponse[]>(
        token,
        'GET',
        `${this.base(repo)}/issues/${number}/comments?per_page=100`,
      ),
    ])
    return {
      ...toTask(issue),
      comments: comments.map((comment) => ({
        author: comment.user?.login ?? 'unknown',
        body: comment.body ?? '',
        createdAt: comment.created_at,
      })),
    }
  }

  async create(
    token: string,
    repo: GitHubRepoRef,
    input: { title: string; body: string },
  ): Promise<Task> {
    return toTask(
      await this.request<IssueResponse>(token, 'POST', `${this.base(repo)}/issues`, input),
    )
  }

  async update(
    token: string,
    repo: GitHubRepoRef,
    number: number,
    patch: TaskPatch,
  ): Promise<Task> {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.body !== undefined) body.body = patch.body
    if (patch.status !== undefined) {
      const current = await this.request<IssueResponse>(
        token,
        'GET',
        `${this.base(repo)}/issues/${number}`,
      )
      const target = labelsForStatus(labelNames(current), patch.status)
      if (patch.status === 'in-progress' || patch.status === 'in-review') {
        await this.ensureLabel(token, repo, patch.status)
      }
      Object.assign(body, target)
    }
    return toTask(
      await this.request<IssueResponse>(
        token,
        'PATCH',
        `${this.base(repo)}/issues/${number}`,
        body,
      ),
    )
  }

  async comment(token: string, repo: GitHubRepoRef, number: number, text: string): Promise<void> {
    await this.request(token, 'POST', `${this.base(repo)}/issues/${number}/comments`, {
      body: text,
    })
  }

  /** Creates Dugout's status label in the repo the first time it is needed. */
  private async ensureLabel(
    token: string,
    repo: GitHubRepoRef,
    status: keyof typeof STATUS_LABELS,
  ) {
    const name = STATUS_LABELS[status]
    const path = `${this.base(repo)}/labels/${encodeURIComponent(name).replace(/%3A/g, ':')}`
    const existing = await this.send(token, 'GET', path)
    if (existing.ok) return
    if (existing.status !== NOT_FOUND) throw new Error(`Could not check label ${name}.`)
    await this.request(token, 'POST', `${this.base(repo)}/labels`, {
      name,
      color: STATUS_LABEL_COLORS[status],
      description: 'Tracked by Dugout',
    })
  }

  private base(repo: GitHubRepoRef): string {
    return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  }

  private async request<T>(
    token: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.send(token, method, path, body)
    if (response.status === 401) throw new GitHubUnauthorizedError()
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { message?: string } | null
      throw new Error(`GitHub: ${detail?.message ?? `request failed (HTTP ${response.status})`}`)
    }
    return (await response.json()) as T
  }

  private send(token: string, method: string, path: string, body?: unknown): Promise<Response> {
    return fetchGitHub(this.deps.fetch, `${this.deps.apiBaseUrl}${path}`, {
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
}
