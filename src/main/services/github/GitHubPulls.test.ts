import { describe, expect, test } from 'vitest'
import { fakeFetch } from './fakeFetch'
import { GitHubPulls } from './GitHubPulls'

const REPO = { owner: 'octo', name: 'app' }
const pull = (extra: Record<string, unknown> = {}) => ({
  number: 12,
  title: 'Fix login',
  html_url: 'https://github.com/octo/app/pull/12',
  state: 'open',
  draft: false,
  merged_at: null,
  head: { sha: 'abc123' },
  ...extra,
})

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch({
    'GET /repos/octo/app/pulls/12/reviews': [{ json: [] }],
    'GET /repos/octo/app/commits/abc123/check-runs': [{ json: { check_runs: [] } }],
    'GET /repos/octo/app/commits/abc123/status': [{ json: { statuses: [] } }],
    ...routes,
  })
  return {
    pulls: new GitHubPulls({ fetch: fake.fetch, apiBaseUrl: 'https://api.github.com' }),
    ...fake,
  }
}

describe('GitHubPulls.forBranch', () => {
  test('has no status when the branch has no pull request', async () => {
    const { pulls } = setup({ 'GET /repos/octo/app/pulls': [{ json: [] }] })
    expect(await pulls.forBranch('tok', REPO, 'feat/login')).toBeNull()
  })

  test('finds the pull request by head branch', async () => {
    const { pulls, requests } = setup({ 'GET /repos/octo/app/pulls': [{ json: [pull()] }] })
    const status = await pulls.forBranch('tok', REPO, 'feat/login')
    expect(status).toMatchObject({ number: 12, title: 'Fix login', state: 'open', review: 'none' })
    expect(new URL(requests[0]?.url ?? '').searchParams.get('head')).toBe('octo:feat/login')
  })

  test.each([
    [{ draft: true }, 'draft'],
    [{ state: 'closed', merged_at: '2026-10-01T00:00:00Z' }, 'merged'],
    [{ state: 'closed' }, 'closed'],
  ])('reports the state %o as %s', async (extra, state) => {
    const { pulls } = setup({ 'GET /repos/octo/app/pulls': [{ json: [pull(extra)] }] })
    expect((await pulls.forBranch('tok', REPO, 'b'))?.state).toBe(state)
  })

  test('uses each reviewer’s latest review; any change request wins', async () => {
    const review = (user: string, state: string) => ({ user: { login: user }, state })
    const { pulls } = setup({
      'GET /repos/octo/app/pulls': [{ json: [pull()] }],
      'GET /repos/octo/app/pulls/12/reviews': [
        {
          json: [
            review('ann', 'CHANGES_REQUESTED'),
            review('ann', 'APPROVED'),
            review('bob', 'COMMENTED'),
          ],
        },
      ],
    })
    expect((await pulls.forBranch('tok', REPO, 'b'))?.review).toBe('approved')

    const { pulls: blocked } = setup({
      'GET /repos/octo/app/pulls': [{ json: [pull()] }],
      'GET /repos/octo/app/pulls/12/reviews': [
        { json: [review('ann', 'APPROVED'), review('bob', 'CHANGES_REQUESTED')] },
      ],
    })
    expect((await blocked.forBranch('tok', REPO, 'b'))?.review).toBe('changes-requested')
  })

  test('summarises check runs and commit statuses', async () => {
    const run = (name: string, status: string, conclusion: string | null) => ({
      name,
      status,
      conclusion,
      html_url: `https://github.com/octo/app/runs/${name}`,
    })
    const { pulls } = setup({
      'GET /repos/octo/app/pulls': [{ json: [pull()] }],
      'GET /repos/octo/app/commits/abc123/check-runs': [
        {
          json: {
            check_runs: [
              run('lint', 'completed', 'success'),
              run('test', 'completed', 'failure'),
              run('docs', 'completed', 'skipped'),
              run('e2e', 'in_progress', null),
            ],
          },
        },
      ],
      'GET /repos/octo/app/commits/abc123/status': [
        {
          json: {
            statuses: [{ context: 'deploy', state: 'success', target_url: 'https://x/deploy' }],
          },
        },
      ],
    })

    const { checks } = (await pulls.forBranch('tok', REPO, 'b')) ?? { checks: null }

    expect(checks).toMatchObject({ state: 'failing', passed: 2, total: 4 })
    expect(checks?.runs.map((r) => [r.name, r.state])).toEqual([
      ['test', 'failing'],
      ['e2e', 'pending'],
      ['lint', 'passing'],
      ['deploy', 'passing'],
      ['docs', 'skipped'],
    ])
  })

  test('reports no checks when the commit has none', async () => {
    const { pulls } = setup({ 'GET /repos/octo/app/pulls': [{ json: [pull()] }] })
    expect((await pulls.forBranch('tok', REPO, 'b'))?.checks).toEqual({
      state: 'none',
      passed: 0,
      total: 0,
      runs: [],
    })
  })
})
