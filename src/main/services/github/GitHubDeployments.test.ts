import { describe, expect, test } from 'vitest'
import { fakeFetch } from './fakeFetch'
import { GitHubUnauthorizedError } from './GitHubApi'
import { GitHubDeployments } from './GitHubDeployments'

const REPO = { owner: 'octo', name: 'app' }
const DEPLOYMENTS = 'GET /repos/octo/app/deployments'
const statusRoute = (id: number) => `GET /repos/octo/app/deployments/${id}/statuses`
const deployment = (id: number, environment = 'Preview') => ({ id, environment })
const status = (state: string, url: string | null = null) => ({
  state,
  environment_url: url,
  target_url: 'https://vercel.com/octo/app/inspect',
})

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(routes)
  const deployments = new GitHubDeployments({
    fetch: fake.fetch,
    apiBaseUrl: 'https://api.github.com',
  })
  return { deployments, ...fake }
}

describe('GitHubDeployments.forBranch', () => {
  test('returns the newest ready deployment with its environment URL', async () => {
    // Arrange
    const { deployments, requests } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(2)] }],
      [statusRoute(2)]: [{ json: [status('success', 'https://app-git-feat.vercel.app')] }],
    })

    // Act
    const preview = await deployments.forBranch('tok', REPO, 'feat/login')

    // Assert
    expect(preview).toEqual({
      environment: 'Preview',
      state: 'ready',
      url: 'https://app-git-feat.vercel.app/',
    })
    const query = new URL(requests[0]?.url ?? '').searchParams
    expect(query.get('ref')).toBe('feat/login')
    expect(requests[0]?.headers.authorization).toBe('Bearer tok')
  })

  test('reports a newer deployment still running, with the last ready URL', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(3), deployment(2)] }],
      [statusRoute(3)]: [{ json: [status('in_progress')] }],
      [statusRoute(2)]: [{ json: [status('success', 'https://old.example.dev')] }],
    })

    const preview = await deployments.forBranch('tok', REPO, 'feat/login')

    expect(preview).toEqual({
      environment: 'Preview',
      state: 'pending',
      url: 'https://old.example.dev/',
    })
  })

  test.each([
    ['failure', 'failed'],
    ['error', 'failed'],
    ['queued', 'pending'],
    ['pending', 'pending'],
  ])('reports a %s status as %s, without a URL', async (state, expected) => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(1)] }],
      [statusRoute(1)]: [{ json: [status(state)] }],
    })

    expect(await deployments.forBranch('tok', REPO, 'b')).toEqual({
      environment: 'Preview',
      state: expected,
      url: null,
    })
  })

  test('treats a deployment with no status yet as pending', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(1)] }],
      [statusRoute(1)]: [{ json: [] }],
    })

    expect((await deployments.forBranch('tok', REPO, 'b'))?.state).toBe('pending')
  })

  test('skips deployments that were replaced (inactive)', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(2, 'Old'), deployment(1)] }],
      [statusRoute(2)]: [{ json: [status('inactive', 'https://gone.example.dev')] }],
      [statusRoute(1)]: [{ json: [status('success', 'https://live.example.dev')] }],
    })

    expect(await deployments.forBranch('tok', REPO, 'b')).toEqual({
      environment: 'Preview',
      state: 'ready',
      url: 'https://live.example.dev/',
    })
  })

  test('never returns a URL that is not http(s)', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(1)] }],
      [statusRoute(1)]: [
        { json: [{ state: 'success', environment_url: 'javascript:alert(1)', target_url: null }] },
      ],
    })

    expect((await deployments.forBranch('tok', REPO, 'b'))?.url).toBeNull()
  })

  test('falls back to the target URL when there is no environment URL', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [deployment(1)] }],
      [statusRoute(1)]: [
        { json: [{ state: 'success', environment_url: '', target_url: 'https://n.netlify.app' }] },
      ],
    })

    expect((await deployments.forBranch('tok', REPO, 'b'))?.url).toBe('https://n.netlify.app/')
  })

  test('finds deployments by the branch head commit when none use the branch name', async () => {
    const { deployments, requests } = setup({
      [DEPLOYMENTS]: [{ json: [] }, { json: [deployment(5)] }],
      'GET /repos/octo/app/branches/feat/login': [{ json: { commit: { sha: 'abc123' } } }],
      [statusRoute(5)]: [{ json: [status('success', 'https://sha.example.dev')] }],
    })

    const preview = await deployments.forBranch('tok', REPO, 'feat/login')

    expect(preview?.url).toBe('https://sha.example.dev/')
    const bySha = requests.find((request) => request.url.includes('sha='))
    expect(new URL(bySha?.url ?? '').searchParams.get('sha')).toBe('abc123')
  })

  test('has no preview when the branch has no deployments or is not on GitHub', async () => {
    const { deployments } = setup({ [DEPLOYMENTS]: [{ json: [] }] })

    expect(await deployments.forBranch('tok', REPO, 'local-only')).toBeNull()
  })

  test('reports an expired sign-in while looking up the branch', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [] }],
      'GET /repos/octo/app/branches/b': [{ status: 401, json: { message: 'Bad credentials' } }],
    })

    await expect(deployments.forBranch('tok', REPO, 'b')).rejects.toBeInstanceOf(
      GitHubUnauthorizedError,
    )
  })

  test('reports other GitHub errors while looking up the branch', async () => {
    const { deployments } = setup({
      [DEPLOYMENTS]: [{ json: [] }],
      'GET /repos/octo/app/branches/b': [{ status: 403, json: { message: 'Forbidden' } }],
    })

    await expect(deployments.forBranch('tok', REPO, 'b')).rejects.toThrow('HTTP 403')
  })
})
