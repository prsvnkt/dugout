import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findLocalRepos, searchRoots } from './findLocalRepos'

function makeDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'dugout-repos-')))
}

/** A folder that looks like a repo, its `.git` last changed `ageSeconds` ago. */
function makeRepo(path: string, ageSeconds = 0): void {
  mkdirSync(join(path, '.git'), { recursive: true })
  const time = Date.now() / 1000 - ageSeconds
  utimesSync(join(path, '.git'), time, time)
}

describe('findLocalRepos', () => {
  it('finds repos one and two levels down, most recently changed first', async () => {
    // Arrange
    const root = makeDir()
    makeRepo(join(root, 'old'), 3600)
    makeRepo(join(root, 'org', 'fresh'))

    // Act
    const repos = await findLocalRepos([root])

    // Assert
    expect(repos.map((repo) => repo.name)).toEqual(['fresh', 'old'])
    expect(repos[0]?.path).toBe(join(root, 'org', 'fresh'))
  })

  it('does not look inside repos, hidden folders, node_modules or deeper than two levels', async () => {
    const root = makeDir()
    makeRepo(join(root, 'app'))
    makeRepo(join(root, 'app', 'packages', 'nested'))
    makeRepo(join(root, '.cache', 'hidden'))
    makeRepo(join(root, 'node_modules', 'dep'))
    makeRepo(join(root, 'a', 'b', 'too-deep'))

    const repos = await findLocalRepos([root])

    expect(repos.map((repo) => repo.name)).toEqual(['app'])
  })

  it('skips missing roots, symlinked folders and roots listed twice', async () => {
    const root = makeDir()
    makeRepo(join(root, 'app'))
    symlinkSync(join(root, 'app'), join(root, 'link'))

    const repos = await findLocalRepos([join(root, 'missing'), root, root])

    expect(repos.map((repo) => repo.name)).toEqual(['app'])
  })

  it('treats a worktree (a .git file) as a repo', async () => {
    const root = makeDir()
    mkdirSync(join(root, 'tree'))
    writeFileSync(join(root, 'tree', '.git'), 'gitdir: /elsewhere\n')

    const repos = await findLocalRepos([root])

    expect(repos.map((repo) => repo.name)).toEqual(['tree'])
  })
})

describe('searchRoots', () => {
  it('searches the clone folder and common code folders, never the home folder itself', () => {
    const roots = searchRoots('common', { homeDir: '/Users/me', cloneParentDir: '/Users/me/work' })

    expect(roots[0]).toBe('/Users/me/work')
    expect(roots).toContain('/Users/me/Developer')
    expect(roots).not.toContain('/Users/me')
    expect(roots).not.toContain('/Users/me/Documents')
  })

  it('ignores a clone folder that is the home folder', () => {
    const roots = searchRoots('common', { homeDir: '/Users/me', cloneParentDir: '/Users/me' })

    expect(roots).not.toContain('/Users/me')
  })

  it('searches Documents and Desktop only when asked', () => {
    expect(searchRoots('documents', { homeDir: '/Users/me' })).toEqual([
      '/Users/me/Documents',
      '/Users/me/Desktop',
    ])
  })
})
