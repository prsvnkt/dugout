import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Project } from '@shared/project'
import { FileService } from '../files/FileService'
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

const files = new FileService({ git: new GitService({ env: ENV }) })

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
      files,
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
      files,
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
      files,
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

describe('WorktreeManager worktree setup', () => {
  let manager: WorktreeManager
  let project: Project

  beforeEach(() => {
    manager = new WorktreeManager({
      git: new GitService({ env: ENV }),
      files,
      baseDir: mkdtempSync(join(tmpdir(), 'dugout-wtm-setup-')),
      createId: () => 'z1',
    })
    const base = makeProject()
    writeFileSync(join(base.rootPath, '.env'), 'TOKEN=local\n')
    // Like most local files, ignored, so a worktree with a copy can still be removed.
    writeFileSync(join(base.rootPath, '.gitignore'), '.env*\n')
    execFileSync('git', ['add', '.gitignore'], { cwd: base.rootPath })
    commitIn(base.rootPath, 'chore: ignore local files')
    project = { ...base, worktreeSetup: { copy: ['.env*'], command: 'npm install' } }
  })

  test('copies the local files into a new worktree', async () => {
    // Act
    const worktree = await manager.create(project)

    // Assert
    expect(readFileSync(join(worktree.path, '.env'), 'utf8')).toBe('TOKEN=local\n')
  })

  test('hands the setup command to the first agent only', async () => {
    // Arrange
    const worktree = await manager.create(project)

    // Act
    const claimed = manager.claimSetup(worktree.path)

    // Assert
    expect(claimed?.command).toBe('npm install')
    expect(manager.claimSetup(worktree.path)).toBeNull()
    claimed?.finish(true)
    expect(manager.claimSetup(worktree.path)).toBeNull()
  })

  test('offers a failed setup again, until the worktree is removed', async () => {
    // Arrange
    const worktree = await manager.create(project)

    // Act
    manager.claimSetup(worktree.path)?.finish(false)

    // Assert
    expect(manager.claimSetup(worktree.path)?.command).toBe('npm install')
    manager.claimSetup(worktree.path)
    await manager.remove(project, worktree.path)
    expect(manager.claimSetup(worktree.path)).toBeNull()
  })

  test('has nothing to run without a setup command, or outside new worktrees', async () => {
    // Arrange
    const plain = { ...project, worktreeSetup: { copy: ['.env'] } }

    // Act
    const worktree = await manager.create(plain)

    // Assert
    expect(manager.claimSetup(worktree.path)).toBeNull()
    expect(manager.claimSetup(project.rootPath)).toBeNull()
  })

  test('creates no worktree when a copy pattern matches a symlink', async () => {
    // Arrange
    symlinkSync('/etc/hosts', join(project.rootPath, '.env.hosts'))

    // Act + Assert
    await expect(manager.create(project)).rejects.toThrow(/symbolic link/)
    expect(await manager.list(project)).toEqual([])
  })
})
