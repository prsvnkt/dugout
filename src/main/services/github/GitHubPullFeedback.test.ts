import { describe, expect, test } from 'vitest'
import { GitHubUnauthorizedError } from './GitHubApi'
import { GitHubPullFeedback, MAX_DETAILED_CHECKS } from './GitHubPullFeedback'
import { fakeFetch } from './fakeFetch'

const REPO = { owner: 'octo', name: 'app' }
const BASE = '/repos/octo/app'

const run = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  name: `job-${id}`,
  status: 'completed',
  conclusion: 'failure',
  html_url: `https://github.com/octo/app/runs/${id}`,
  output: { title: 'Tests failed', summary: '2 tests failed' },
  app: { slug: 'github-actions' },
  ...extra,
})

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch({
    [`GET ${BASE}/pulls/7`]: [{ json: { head: { sha: 'abc' } } }],
    [`GET ${BASE}/commits/abc/check-runs`]: [{ json: { check_runs: [] } }],
    [`GET ${BASE}/commits/abc/status`]: [{ json: { statuses: [] } }],
    ...routes,
  })
  return {
    feedback: new GitHubPullFeedback({ fetch: fake.fetch, apiBaseUrl: 'https://api.github.com' }),
    ...fake,
  }
}

describe('GitHubPullFeedback.reviewThreads', () => {
  test('asks GraphQL for the pull request’s threads and keeps the unresolved ones', async () => {
    // Arrange
    const node = (isResolved: boolean, body: string) => ({
      isResolved,
      isOutdated: false,
      path: 'a.ts',
      line: 3,
      startLine: null,
      originalLine: 3,
      originalStartLine: null,
      comments: { nodes: [{ author: { login: 'ann' }, body }] },
    })
    const { feedback, requests } = setup({
      'POST /graphql': [
        {
          json: {
            data: {
              repository: {
                pullRequest: { reviewThreads: { nodes: [node(true, 'old'), node(false, 'new')] } },
              },
            },
          },
        },
      ],
    })

    // Act
    const threads = await feedback.reviewThreads('tok', REPO, 7)

    // Assert
    expect(threads.map((thread) => thread.comments[0]?.body)).toEqual(['new'])
    const sent = JSON.parse(requests[0]?.body ?? '{}') as { variables: unknown }
    expect(sent.variables).toEqual({ owner: 'octo', name: 'app', number: 7 })
    expect(requests[0]?.headers.authorization).toBe('Bearer tok')
  })
})

describe('GitHubPullFeedback.failingChecks', () => {
  test('returns failing runs with output, annotations and the log tail', async () => {
    // Arrange
    const { feedback } = setup({
      [`GET ${BASE}/commits/abc/check-runs`]: [
        { json: { check_runs: [run(1), run(2, { conclusion: 'success' })] } },
      ],
      [`GET ${BASE}/check-runs/1/annotations`]: [
        {
          json: [
            { path: 'a.ts', start_line: 4, annotation_level: 'failure', message: 'Expected 1' },
          ],
        },
      ],
      [`GET ${BASE}/actions/jobs/1/logs`]: [{ text: 'npm test\n##[error]Exit code 1\ncleanup' }],
    })

    // Act
    const checks = await feedback.failingChecks('tok', REPO, 7)

    // Assert
    expect(checks).toEqual([
      {
        name: 'job-1',
        url: 'https://github.com/octo/app/runs/1',
        title: 'Tests failed',
        summary: '2 tests failed',
        annotations: [{ path: 'a.ts', line: 4, level: 'failure', message: 'Expected 1' }],
        logTail: 'npm test\nError: Exit code 1',
      },
    ])
  })

  test('adds failing commit statuses and leaves out details it cannot fetch', async () => {
    const { feedback, requests } = setup({
      [`GET ${BASE}/commits/abc/check-runs`]: [
        { json: { check_runs: [run(1, { app: { slug: 'circleci' }, output: null })] } },
      ],
      [`GET ${BASE}/commits/abc/status`]: [
        {
          json: {
            statuses: [
              {
                context: 'ci/jenkins',
                state: 'error',
                description: 'Build broke',
                target_url: null,
              },
              { context: 'ok', state: 'success', description: null, target_url: null },
            ],
          },
        },
      ],
    })

    const checks = await feedback.failingChecks('tok', REPO, 7)

    expect(checks).toMatchObject([
      { name: 'job-1', title: null, summary: null, annotations: [], logTail: null },
      { name: 'ci/jenkins', title: 'Build broke', logTail: null },
    ])
    expect(requests.some((request) => request.url.includes('/logs'))).toBe(false)
  })

  test('fetches details for the first few failing runs only', async () => {
    const runs = Array.from({ length: MAX_DETAILED_CHECKS + 2 }, (_, i) => run(i + 1))
    const { feedback, requests } = setup({
      [`GET ${BASE}/commits/abc/check-runs`]: [{ json: { check_runs: runs } }],
    })

    const checks = await feedback.failingChecks('tok', REPO, 7)

    expect(checks).toHaveLength(runs.length)
    const logRequests = requests.filter((request) => request.url.includes('/logs'))
    expect(logRequests).toHaveLength(MAX_DETAILED_CHECKS)
  })

  test('an expired sign-in while fetching a log still fails the call', async () => {
    const { feedback } = setup({
      [`GET ${BASE}/commits/abc/check-runs`]: [{ json: { check_runs: [run(1)] } }],
      [`GET ${BASE}/actions/jobs/1/logs`]: [{ status: 401, json: {} }],
    })

    await expect(feedback.failingChecks('tok', REPO, 7)).rejects.toBeInstanceOf(
      GitHubUnauthorizedError,
    )
  })
})
