import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Project } from '@shared/project'
import { GitService } from '../git/GitService'
import { WorktreeManager } from './WorktreeManager'

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
}

function makeProject(withCommit = true): Project {
  const rootPath = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-wtm-repo-')))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: rootPath })
  if (withCommit) {
    writeFileSync(join(rootPath, 'a.txt'), 'a\n')
    execFileSync('git', ['add', '.'], { cwd: rootPath })
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: rootPath, env: ENV })
  }
  return { id: 'proj-1', name: 'app', rootPath, color: 'teal', createdAt: '2026-10-05T00:00:00Z' }
}

function commitIn(cwd: string, message: string): void {
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', message], { cwd, env: ENV })
}

function branches(project: Project): string[] {
  return execFileSync('git', ['branch', '--format=%(refname:short)'], {
    cwd: project.rootPath,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
}

describe('WorktreeManager', () => {
  let manager: WorktreeManager
  let baseDir: string
  let nextId: number

  beforeEach(() => {
    // A symlinked temp dir (/var → /private/var) checks that paths are compared canonically.
    baseDir = mkdtempSync(join(tmpdir(), 'dugout-wtm-base-'))
    nextId = 0
    manager = new WorktreeManager({
      git: new GitService({ env: ENV }),
      baseDir,
      createId: () => `s${++nextId}`,
    })
  })

  test('creates a worktree on a dugout/ branch inside the base folder', async () => {
    const project = makeProject()

    const worktree = await manager.create(project)

    expect(worktree).toEqual({
      path: join(realpathSync(baseDir), 'proj-1', 's1'),
      branch: 'dugout/s1',
      name: 's1',
    })
    expect(await manager.list(project)).toEqual([worktree])
  })

  test('lists only worktrees Dugout manages', async () => {
    const project = makeProject()
    const own = await manager.create(project)
    const elsewhere = join(realpathSync(mkdtempSync(join(tmpdir(), 'other-'))), 'wt')
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'other', elsewhere], {
      cwd: project.rootPath,
    })

    expect(await manager.list(project)).toEqual([own])
  })

  test('explains that worktrees need a first commit', async () => {
    await expect(manager.create(makeProject(false))).rejects.toThrow('first commit')
  })

  test('resolves a checkout to the main repo or a managed worktree only', async () => {
    const project = makeProject()
    const worktree = await manager.create(project)

    expect(await manager.resolveCheckout(project, undefined)).toBe(project.rootPath)
    expect(await manager.resolveCheckout(project, worktree.path)).toBe(worktree.path)
    await expect(manager.resolveCheckout(project, '/etc')).rejects.toThrow('not a worktree')
  })

  test('removes a managed worktree and refuses anything else', async () => {
    const project = makeProject()
    const worktree = await manager.create(project)

    await manager.remove(project, worktree.path)

    expect(await manager.list(project)).toEqual([])
    await expect(manager.remove(project, project.rootPath)).rejects.toThrow('not a worktree')
  })

  test('deletes the session branch on remove when it has no unmerged work', async () => {
    const project = makeProject()
    const worktree = await manager.create(project)

    await manager.remove(project, worktree.path)

    expect(branches(project)).toEqual(['main'])
  })

  test('keeps the session branch on remove when it has commits not in the checkout', async () => {
    const project = makeProject()
    const worktree = await manager.create(project)
    commitIn(worktree.path, 'feat: agent work')

    await manager.remove(project, worktree.path)

    expect(branches(project)).toEqual(['dugout/s1', 'main'])
  })
})

describe('WorktreeManager named worktrees', () => {
  test('uses the given name for the folder and branch, adding a suffix if it is taken', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'dugout-wtm-named-'))
    let nextId = 0
    const manager = new WorktreeManager({
      git: new GitService({ env: ENV }),
      baseDir,
      createId: () => `x${++nextId}`,
    })
    const project = makeProject()

    const first = await manager.create(project, { name: '42-fix-login' })
    const second = await manager.create(project, { name: '42-fix-login' })

    expect(first.branch).toBe('dugout/42-fix-login')
    expect(second.branch).toBe('dugout/42-fix-login-x1')
  })
})

describe('WorktreeManager leftover branches', () => {
  test('avoids a branch left behind by a removed worktree', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'dugout-wtm-left-'))
    const manager = new WorktreeManager({
      git: new GitService({ env: ENV }),
      baseDir,
      createId: () => 'y1',
    })
    const project = makeProject()
    const first = await manager.create(project, { name: '7-task' })
    commitIn(first.path, 'feat: work only on the session branch')
    await manager.remove(project, first.path) // unmerged work, so dugout/7-task stays

    const again = await manager.create(project, { name: '7-task' })

    expect(again.branch).toBe('dugout/7-task-y1')
  })
})
