import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const STUB_TOKEN = 'gho_stub_secret_token'
export const STUB_USER_CODE = 'WXYZ-1234'
const AVATAR = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

export interface StubRepo {
  readonly name: string
  readonly cloneUrl: string
}

export interface StubIssue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  comments: { author: string; body: string }[]
}

export interface StubOptions {
  /** Issue 1-second access tokens with rotating refresh tokens ("Expire user access tokens"). */
  readonly expiringTokens?: boolean
  /** Issues of octocat/app, served under /api/repos/octocat/app. */
  readonly issues?: StubIssue[]
  /** A pull request for one branch of octocat/app, with its check runs. */
  readonly pullRequest?: StubPullRequest
}

export interface StubPullRequest {
  readonly branch: string
  readonly number: number
  readonly title: string
  readonly checks: { name: string; conclusion: 'success' | 'failure' | null }[]
}

/** A tiny stand-in for github.com + api.github.com: device flow, refresh, /user, /user/repos. */
export async function startGitHubStub(repos: readonly StubRepo[] = [], options: StubOptions = {}) {
  let polls = 0
  let generation = 1
  let isRefreshRevoked = false
  let refreshes = 0
  let isUnavailable = false
  const issues: StubIssue[] = options.issues ?? []
  const labels = new Set<string>()
  const accessToken = () => (options.expiringTokens ? `ghu_stub_${generation}` : STUB_TOKEN)
  const tokenResponse = () =>
    options.expiringTokens
      ? {
          access_token: accessToken(),
          expires_in: 1,
          refresh_token: `ghr_stub_${generation}`,
          refresh_token_expires_in: 3_600,
        }
      : { access_token: STUB_TOKEN }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub')
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      if (isUnavailable) return json({ message: 'Service unavailable' }, 503)
      const origin = `http://${req.headers.host}`
      const form = new URLSearchParams(body)
      if (url.pathname === '/login/device/code') {
        return json({
          device_code: 'stub-device',
          user_code: STUB_USER_CODE,
          verification_uri: `${origin}/login/device`,
          expires_in: 900,
          interval: 1,
        })
      }
      if (
        url.pathname === '/login/oauth/access_token' &&
        form.get('grant_type') === 'refresh_token'
      ) {
        // Refresh tokens rotate: only the latest one works, once.
        if (isRefreshRevoked || form.get('refresh_token') !== `ghr_stub_${generation}`) {
          return json({ error: 'bad_refresh_token' })
        }
        refreshes += 1
        generation += 1
        return json(tokenResponse())
      }
      if (url.pathname === '/login/oauth/access_token') {
        polls += 1
        return json(polls < 2 ? { error: 'authorization_pending' } : tokenResponse())
      }
      const authorized = req.headers.authorization === `Bearer ${accessToken()}`
      if (url.pathname.startsWith('/api/') && !authorized)
        return json({ message: 'Bad credentials' }, 401)
      if (url.pathname === '/api/user') {
        return json({ login: 'octocat', name: 'The Octocat', avatar_url: AVATAR })
      }
      const repoRoute = /^\/api\/repos\/octocat\/app\/(.+)$/.exec(url.pathname)
      if (repoRoute?.[1]) {
        return handleRepo(repoRoute[1], req.method ?? 'GET', body, origin, json, url.searchParams)
      }
      if (url.pathname === '/api/user/repos') {
        return json(
          repos.map((repo) => ({
            name: repo.name,
            full_name: `octocat/${repo.name}`,
            owner: { login: 'octocat' },
            description: `The ${repo.name} repo`,
            private: false,
            clone_url: repo.cloneUrl,
            pushed_at: '2026-10-01T00:00:00Z',
          })),
        )
      }
      json({ message: 'Not found' }, 404)
    })
  })
  type Json = (body: unknown, status?: number) => void
  const toIssue = (issue: StubIssue, origin: string) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    html_url: `${origin}/octocat/app/issues/${issue.number}`,
    user: { login: 'octocat' },
    labels: issue.labels.map((name) => ({ name })),
    comments: issue.comments.length,
    updated_at: '2026-10-01T00:00:00Z',
  })
  /** A small in-memory GitHub Issues API for octocat/app. */
  function handleRepo(
    path: string,
    method: string,
    body: string,
    origin: string,
    json: Json,
    query: URLSearchParams,
  ) {
    const input = body ? (JSON.parse(body) as Record<string, unknown>) : {}
    const pr = options.pullRequest
    if (path === 'pulls') {
      const matches = pr && query.get('head') === `octocat:${pr.branch}`
      return json(
        matches
          ? [
              {
                number: pr.number,
                title: pr.title,
                html_url: `${origin}/octocat/app/pull/${pr.number}`,
                state: 'open',
                draft: false,
                merged_at: null,
                head: { sha: 'stubsha' },
              },
            ]
          : [],
      )
    }
    if (pr && path === `pulls/${pr.number}/reviews`)
      return json([{ user: { login: 'ann' }, state: 'APPROVED' }])
    if (pr && path === 'commits/stubsha/check-runs') {
      return json({
        check_runs: pr.checks.map((check) => ({
          name: check.name,
          status: check.conclusion ? 'completed' : 'in_progress',
          conclusion: check.conclusion,
          html_url: `${origin}/octocat/app/runs/${check.name}`,
        })),
      })
    }
    if (pr && path === 'commits/stubsha/status') return json({ statuses: [] })
    if (path === 'issues' && method === 'GET')
      return json(issues.map((issue) => toIssue(issue, origin)))
    if (path === 'issues' && method === 'POST') {
      const issue: StubIssue = {
        number: issues.length + 1,
        title: String(input.title),
        body: String(input.body ?? ''),
        state: 'open',
        labels: [],
        comments: [],
      }
      issues.push(issue)
      return json(toIssue(issue, origin), 201)
    }
    const labelRoute = /^labels\/(.+)$/.exec(path)
    if (labelRoute?.[1])
      return labels.has(decodeURIComponent(labelRoute[1])) ? json({}) : json({}, 404)
    if (path === 'labels' && method === 'POST') {
      labels.add(String(input.name))
      return json({}, 201)
    }
    const issueRoute = /^issues\/(\d+)(\/comments)?$/.exec(path)
    const issue = issueRoute
      ? issues.find((candidate) => candidate.number === Number(issueRoute[1]))
      : undefined
    if (!issue) return json({ message: 'Not Found' }, 404)
    if (issueRoute?.[2] && method === 'GET') {
      return json(
        issue.comments.map((c) => ({
          user: { login: c.author },
          body: c.body,
          created_at: '2026-10-02T00:00:00Z',
        })),
      )
    }
    if (issueRoute?.[2] && method === 'POST') {
      issue.comments.push({ author: 'octocat', body: String(input.body) })
      return json({ id: issue.comments.length }, 201)
    }
    if (method === 'PATCH') {
      if (typeof input.title === 'string') issue.title = input.title
      if (typeof input.body === 'string') issue.body = input.body
      if (input.state === 'open' || input.state === 'closed') issue.state = input.state
      if (Array.isArray(input.labels)) issue.labels = input.labels.map(String)
    }
    return json(toIssue(issue, origin))
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    refreshCount: () => refreshes,
    issues,
    /** Simulates GitHub being down (every request answers 503). */
    setUnavailable: (unavailable: boolean) => {
      isUnavailable = unavailable
    },
    revokeRefreshToken: () => {
      isRefreshRevoked = true
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export function gitHubTestEnv(baseUrl: string): Record<string, string> {
  return {
    DUGOUT_GITHUB_BASE_URL: baseUrl,
    DUGOUT_GITHUB_CLIENT_ID: 'stub-client',
    DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1',
  }
}
