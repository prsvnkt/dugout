import { describe, expect, test } from 'vitest'
import { BRANCH_FORMAT_FIELDS, parseBranches } from './parseBranches'

const ROOT = '/repo'
const record = (fields: Partial<Record<(typeof BRANCH_FORMAT_FIELDS)[number], string>>) =>
  BRANCH_FORMAT_FIELDS.map((field) => fields[field] ?? '').join('\0')
const commit = {
  objectname: 'abc1234',
  committerdate: '2026-10-07T14:34:07+01:00',
  authorname: 'Ada',
  subject: 'feat: things',
}

describe('parseBranches', () => {
  test('lists local branches with their last commit and marks the current one', () => {
    // Arrange
    const stdout = [
      record({ ...commit, refname: 'refs/heads/main', HEAD: '*', worktreepath: ROOT }),
      record({ ...commit, refname: 'refs/heads/feat/x', HEAD: ' ' }),
    ].join('\n')

    // Act
    const branches = parseBranches(stdout, ROOT)

    // Assert
    expect(branches).toEqual([
      {
        kind: 'local',
        name: 'main',
        isCurrent: true,
        checkedOutAt: null,
        commit: {
          sha: 'abc1234',
          subject: 'feat: things',
          author: 'Ada',
          date: commit.committerdate,
        },
      },
      expect.objectContaining({ kind: 'local', name: 'feat/x', isCurrent: false }),
    ])
  })

  test('notes branches checked out in another worktree', () => {
    const stdout = record({ ...commit, refname: 'refs/heads/dugout/1', worktreepath: '/wt/one' })

    expect(parseBranches(stdout, ROOT)[0]).toMatchObject({ checkedOutAt: '/wt/one' })
  })

  test('lists remote branches only when there is no local branch of that name', () => {
    const stdout = [
      record({ ...commit, refname: 'refs/heads/main' }),
      record({ ...commit, refname: 'refs/remotes/origin/main' }),
      record({ ...commit, refname: 'refs/remotes/origin/feat/remote-only' }),
    ].join('\n')

    expect(parseBranches(stdout, ROOT).map((branch) => branch.name)).toEqual([
      'main',
      'origin/feat/remote-only',
    ])
    expect(parseBranches(stdout, ROOT)[1]).toMatchObject({
      kind: 'remote',
      localName: 'feat/remote-only',
    })
  })

  test('skips symbolic refs such as origin/HEAD, and blank lines', () => {
    const stdout = [
      record({
        ...commit,
        refname: 'refs/remotes/origin/HEAD',
        symref: 'refs/remotes/origin/main',
      }),
      '',
    ].join('\n')

    expect(parseBranches(stdout, ROOT)).toEqual([])
  })

  test('keeps subjects that contain separators intact', () => {
    const stdout = record({ ...commit, refname: 'refs/heads/a', subject: 'fix: a | b\tc' })

    expect(parseBranches(stdout, ROOT)[0]?.commit.subject).toBe('fix: a | b\tc')
  })
})
