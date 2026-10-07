import { describe, expect, it } from 'vitest'
import type { GitHubRepo } from '@shared/github'
import type { LocalRepo } from '@shared/welcome'
import { mergeLocalRepos, parentFolderName, recentlyPushed } from './repoLists'

const local = (name: string, modifiedAt: number, parent = '/Users/me/Developer'): LocalRepo => ({
  name,
  path: `${parent}/${name}`,
  modifiedAt,
})

const remote = (name: string, pushedAt: string | null): GitHubRepo => ({
  fullName: `octocat/${name}`,
  name,
  owner: 'octocat',
  description: null,
  isPrivate: false,
  cloneUrl: `https://github.com/octocat/${name}.git`,
  pushedAt,
})

describe('mergeLocalRepos', () => {
  it('lists each repo once, most recently changed first', () => {
    // Arrange
    const common = [local('api', 300), local('web', 100)]
    const documents = [local('notes', 200, '/Users/me/Documents'), local('api', 300)]

    // Act
    const merged = mergeLocalRepos(common, documents)

    // Assert
    expect(merged.map((repo) => repo.name)).toEqual(['api', 'notes', 'web'])
  })
})

describe('parentFolderName', () => {
  it('names the folder a repo sits in', () => {
    expect(parentFolderName('/Users/me/Developer/app')).toBe('Developer')
    expect(parentFolderName('/app')).toBe('/')
  })
})

describe('recentlyPushed', () => {
  it('keeps the most recently pushed repos, never-pushed ones last', () => {
    const repos = [
      remote('empty', null),
      remote('old', '2024-01-01T00:00:00Z'),
      remote('new', '2026-10-01T00:00:00Z'),
    ]

    expect(recentlyPushed(repos, 2).map((repo) => repo.name)).toEqual(['new', 'old'])
  })
})
