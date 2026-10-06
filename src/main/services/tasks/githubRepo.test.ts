import { describe, expect, test } from 'vitest'
import { githubRepoFromRemote } from './githubRepo'

describe('githubRepoFromRemote', () => {
  test.each([
    'git@github.com:octo/app.git',
    'https://github.com/octo/app.git',
    'https://github.com/octo/app',
    'ssh://git@github.com/octo/app.git',
  ])('reads owner and name from %s', (remote) => {
    expect(githubRepoFromRemote(remote, 'https://github.com')).toEqual({
      owner: 'octo',
      name: 'app',
    })
  })

  test('returns null for other hosts', () => {
    expect(githubRepoFromRemote('git@gitlab.com:octo/app.git', 'https://github.com')).toBeNull()
    expect(githubRepoFromRemote('/srv/repos/app.git', 'https://github.com')).toBeNull()
  })

  test('accepts the configured host (e.g. a test stub)', () => {
    expect(
      githubRepoFromRemote('http://127.0.0.1:4000/octo/app.git', 'http://127.0.0.1:4000'),
    ).toEqual({ owner: 'octo', name: 'app' })
  })
})
