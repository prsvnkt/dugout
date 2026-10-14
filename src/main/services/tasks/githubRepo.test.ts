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

  test.each([
    'https://github.com/../app.git',
    'https://github.com/octo/..',
    'https://github.com/./app',
    'https://github.com/octo/.',
    'git@github.com:octo/a%2Fb.git',
    'git@github.com:octo/a?b.git',
    'git@github.com:oc to/app.git',
  ])('refuses an owner or name that could steer API paths: %s', (remote) => {
    expect(githubRepoFromRemote(remote, 'https://github.com')).toBeNull()
  })

  test('keeps owners and names with dots, dashes and underscores', () => {
    expect(
      githubRepoFromRemote('git@github.com:my-org_1/app.v2-x.git', 'https://github.com'),
    ).toEqual({ owner: 'my-org_1', name: 'app.v2-x' })
  })

  test('accepts the configured host (e.g. a test stub)', () => {
    expect(
      githubRepoFromRemote('http://127.0.0.1:4000/octo/app.git', 'http://127.0.0.1:4000'),
    ).toEqual({ owner: 'octo', name: 'app' })
  })
})
