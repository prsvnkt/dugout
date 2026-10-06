import { describe, expect, test } from 'vitest'
import { buildPullRequestUrl } from './pullRequestUrl'

describe('buildPullRequestUrl', () => {
  test.each([
    'git@github.com:acme/app.git',
    'ssh://git@github.com/acme/app.git',
    'https://github.com/acme/app.git',
    'https://github.com/acme/app',
    'https://token@github.com/acme/app.git',
  ])('builds a GitHub compare URL from %s', (remote) => {
    expect(buildPullRequestUrl(remote, 'main', 'feat/login')).toBe(
      'https://github.com/acme/app/compare/main...feat/login?expand=1',
    )
  })

  test('builds a GitLab merge request URL, including nested groups', () => {
    expect(buildPullRequestUrl('git@gitlab.com:acme/web/app.git', 'main', 'fix/x')).toBe(
      'https://gitlab.com/acme/web/app/-/merge_requests/new' +
        '?merge_request%5Bsource_branch%5D=fix%2Fx&merge_request%5Btarget_branch%5D=main',
    )
  })

  test('encodes unusual characters in branch names', () => {
    expect(buildPullRequestUrl('git@github.com:a/b.git', 'main', 'feat/a#b')).toBe(
      'https://github.com/a/b/compare/main...feat/a%23b?expand=1',
    )
  })

  test('rejects hosts it does not know', () => {
    expect(() => buildPullRequestUrl('git@bitbucket.org:a/b.git', 'main', 'x')).toThrow(
      'GitHub and GitLab',
    )
    expect(() => buildPullRequestUrl('/srv/git/app.git', 'main', 'x')).toThrow('GitHub and GitLab')
  })
})

describe('buildPullRequestUrl descriptions', () => {
  test('pre-fills the description, e.g. to close the task', () => {
    expect(buildPullRequestUrl('git@github.com:a/b.git', 'main', 'dugout/42-x', 'Closes #42')).toBe(
      'https://github.com/a/b/compare/main...dugout/42-x?expand=1&body=Closes+%2342',
    )
  })
})
