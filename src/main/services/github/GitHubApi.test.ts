import { describe, expect, test } from 'vitest'
import { fakeFetch } from './fakeFetch'
import { GitHubApi, GitHubUnauthorizedError, GitHubUnavailableError } from './GitHubApi'

const api = (routes: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(routes)
  return {
    api: new GitHubApi({ fetch: fake.fetch, apiBaseUrl: 'https://api.github.com' }),
    ...fake,
  }
}

const repo = (name: string) => ({
  name,
  full_name: `octo/${name}`,
  owner: { login: 'octo' },
  description: null,
  private: true,
  clone_url: `https://github.com/octo/${name}.git`,
  pushed_at: '2026-10-01T00:00:00Z',
})

describe('GitHubApi', () => {
  test('reads the signed-in account with the token', async () => {
    const { api: client, requests } = api({
      'GET /user': [{ json: { login: 'octo', name: 'Octo Cat', avatar_url: 'https://a/1.png' } }],
    })
    expect(await client.getUser('gho_x')).toEqual({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://a/1.png',
    })
    expect(requests[0]?.headers.authorization).toBe('Bearer gho_x')
  })

  test('raises a distinct error for a revoked token', async () => {
    const { api: client } = api({
      'GET /user': [{ status: 401, json: { message: 'Bad credentials' } }],
    })
    await expect(client.getUser('gho_x')).rejects.toBeInstanceOf(GitHubUnauthorizedError)
  })

  test('lists repositories across pages, most recently pushed first', async () => {
    const { api: client, requests } = api({
      'GET /user/repos': [
        { json: Array.from({ length: 100 }, (_, i) => repo(`r${i}`)) },
        { json: [repo('last')] },
      ],
    })

    const repos = await client.listRepos('gho_x')

    expect(repos).toHaveLength(101)
    expect(repos[0]).toEqual({
      fullName: 'octo/r0',
      name: 'r0',
      owner: 'octo',
      description: null,
      isPrivate: true,
      cloneUrl: 'https://github.com/octo/r0.git',
      pushedAt: '2026-10-01T00:00:00Z',
    })
    expect(new URL(requests[0]?.url ?? '').searchParams.get('sort')).toBe('pushed')
    expect(new URL(requests[1]?.url ?? '').searchParams.get('page')).toBe('2')
  })
})

describe('GitHubApi availability', () => {
  test('reports GitHub server errors as unavailable', async () => {
    const { api: client } = api({
      'GET /user': [{ status: 503, json: { message: 'Unavailable' } }],
    })
    await expect(client.getUser('gho_x')).rejects.toBeInstanceOf(GitHubUnavailableError)
  })

  test('reports network failures as unavailable', async () => {
    const offline = new GitHubApi({
      fetch: async () => Promise.reject(new TypeError('fetch failed')),
      apiBaseUrl: 'https://api.github.com',
    })
    await expect(offline.getUser('gho_x')).rejects.toBeInstanceOf(GitHubUnavailableError)
  })
})
