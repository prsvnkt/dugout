import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { GitService } from './GitService'

const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com']

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8' })
}

function makeRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-gitsvc-')))
  git(repo, 'init', '-q', '-b', 'main')
  return repo
}

function makeRepoWithCommit(): string {
  const repo = makeRepo()
  writeFileSync(join(repo, 'readme.md'), 'hello\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  return repo
}

const service = new GitService({ env: { ...process.env, ...gitIdentityEnv() } })

function gitIdentityEnv() {
  return {
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  }
}

describe('GitService.status', () => {
  test('lists modified, untracked and staged files', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'readme.md'), 'changed\n')
    writeFileSync(join(repo, 'new*file.ts'), 'x\n')
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src', 'staged.ts'), 'y\n')
    git(repo, 'add', 'src/staged.ts')

    const status = await service.status(repo)

    expect(status.branch).toBe('main')
    expect(status.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'readme.md', staged: null, unstaged: 'modified' }),
        expect.objectContaining({ path: 'new*file.ts', staged: null, unstaged: 'untracked' }),
        expect.objectContaining({ path: 'src/staged.ts', staged: 'added', unstaged: null }),
      ]),
    )
  })

  test('reports lines added and removed for each side of a change', async () => {
    // Arrange: a staged edit plus a further unstaged edit, a new file, a binary and a rename
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'old.ts'), 'a\nb\nc\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'more')
    writeFileSync(join(repo, 'readme.md'), 'hello\nstaged\n')
    git(repo, 'add', 'readme.md')
    writeFileSync(join(repo, 'readme.md'), 'staged\n')
    writeFileSync(join(repo, 'notes.md'), 'one\ntwo\nthree')
    writeFileSync(join(repo, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]))
    git(repo, 'mv', 'old.ts', 'new.ts')

    // Act
    const files = new Map((await service.status(repo)).files.map((file) => [file.path, file]))

    // Assert
    expect(files.get('readme.md')).toMatchObject({
      stagedStats: { kind: 'text', additions: 1, deletions: 0 },
      unstagedStats: { kind: 'text', additions: 0, deletions: 1 },
    })
    expect(files.get('notes.md')?.unstagedStats).toEqual({
      kind: 'text',
      additions: 3,
      deletions: 0,
    })
    expect(files.get('logo.png')?.unstagedStats).toEqual({ kind: 'binary' })
    expect(files.get('new.ts')).toMatchObject({
      staged: 'renamed',
      stagedStats: { kind: 'text', additions: 0, deletions: 0 },
    })
  })

  test('reports staged line stats before the first commit', async () => {
    const repo = makeRepo()
    writeFileSync(join(repo, 'first.ts'), 'a\nb\n')
    git(repo, 'add', '.')

    const [file] = (await service.status(repo)).files

    expect(file?.stagedStats).toEqual({ kind: 'text', additions: 2, deletions: 0 })
  })

  test('does not count untracked files it should not read', async () => {
    const repo = makeRepoWithCommit()
    symlinkSync('/etc/hosts', join(repo, 'link'))

    const [file] = (await service.status(repo)).files

    expect(file).toMatchObject({ path: 'link', unstaged: 'untracked', unstagedStats: null })
  })

  test('does not take the index lock, so it never blocks an agent', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, '.git', 'index.lock'), '')
    await expect(service.status(repo)).resolves.toMatchObject({ branch: 'main' })
  })
})

describe('GitService staging', () => {
  test('stages and unstages files', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'readme.md'), 'changed\n')

    await service.stage(repo, ['readme.md'])
    expect((await service.status(repo)).files[0]?.staged).toBe('modified')

    await service.unstage(repo, ['readme.md'])
    expect((await service.status(repo)).files[0]).toMatchObject({
      staged: null,
      unstaged: 'modified',
    })
  })

  test('unstages before the first commit', async () => {
    const repo = makeRepo()
    writeFileSync(join(repo, 'a.txt'), 'x\n')
    git(repo, 'add', 'a.txt')

    await service.unstage(repo, ['a.txt'])

    expect((await service.status(repo)).files).toEqual([
      expect.objectContaining({ path: 'a.txt', staged: null, unstaged: 'untracked' }),
    ])
  })

  test('treats paths literally, never as glob patterns', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'a*.txt'), 'literal\n')
    writeFileSync(join(repo, 'abc.txt'), 'other\n')

    await service.stage(repo, ['a*.txt'])

    const staged = (await service.status(repo)).files.filter((file) => file.staged)
    expect(staged.map((file) => file.path)).toEqual(['a*.txt'])
  })

  test('discards changes to tracked files and deletes untracked ones', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'readme.md'), 'oops\n')
    writeFileSync(join(repo, 'scratch.txt'), 'temp\n')

    await service.discard(repo, ['readme.md', 'scratch.txt'])

    expect(readFileSync(join(repo, 'readme.md'), 'utf8')).toBe('hello\n')
    expect(existsSync(join(repo, 'scratch.txt'))).toBe(false)
    expect((await service.status(repo)).files).toEqual([])
  })
})

describe('GitService.commit', () => {
  test('commits staged changes with a multi-line message', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'readme.md'), 'changed\n')
    await service.stage(repo, ['readme.md'])

    await service.commit(repo, 'feat: change readme\n\nWith a body that has "quotes" & $vars')

    expect(git(repo, 'log', '-1', '--format=%B').trim()).toBe(
      'feat: change readme\n\nWith a body that has "quotes" & $vars',
    )
    expect((await service.status(repo)).files).toEqual([])
  })

  test('reports git errors in a readable way', async () => {
    const repo = makeRepoWithCommit()
    await expect(service.commit(repo, 'nothing staged')).rejects.toThrow(/nothing.*commit/i)
  })
})

describe('GitService.push', () => {
  function makeClone(): { clone: string; remote: string } {
    const remote = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-remote-')))
    git(remote, 'init', '-q', '--bare', '-b', 'main')
    const clone = makeRepoWithCommit()
    git(clone, 'remote', 'add', 'origin', remote)
    return { clone, remote }
  }

  test('publishes a branch without an upstream and sets it', async () => {
    const { clone, remote } = makeClone()

    await service.push(clone)

    const status = await service.status(clone)
    expect(status.upstream).toBe('origin/main')
    expect(git(remote, 'log', '--oneline', 'main')).toContain('init')
  })

  test('pushes new commits to the existing upstream', async () => {
    const { clone, remote } = makeClone()
    await service.push(clone)
    writeFileSync(join(clone, 'readme.md'), 'second\n')
    git(clone, 'commit', '-qam', 'second')
    expect((await service.status(clone)).ahead).toBe(1)

    await service.push(clone)

    expect((await service.status(clone)).ahead).toBe(0)
    expect(git(remote, 'log', '--oneline', 'main')).toContain('second')
  })

  test('explains when there is no remote to push to', async () => {
    const repo = makeRepoWithCommit()
    await expect(service.push(repo)).rejects.toThrow('no remote named "origin"')
  })
})

describe('GitService pull requests', () => {
  function makeFeatureRepo(): string {
    const repo = makeRepoWithCommit()
    git(repo, 'remote', 'add', 'origin', 'git@github.com:acme/app.git')
    git(repo, 'checkout', '-q', '-b', 'feat/login')
    return repo
  }

  test('reports the remote default branch as the base', async () => {
    const repo = makeFeatureRepo()
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop')
    expect((await service.status(repo)).baseBranch).toBe('develop')
  })

  test('has no base branch when origin/HEAD is unknown', async () => {
    expect((await service.status(makeFeatureRepo())).baseBranch).toBeNull()
  })

  test('builds the compare URL against the base branch, defaulting to main', async () => {
    const repo = makeFeatureRepo()
    expect(await service.pullRequestUrl(repo)).toBe(
      'https://github.com/acme/app/compare/main...feat/login?expand=1',
    )
  })

  test('a task branch pre-fills "Closes #N" so merging closes the task', async () => {
    const repo = makeRepoWithCommit()
    git(repo, 'remote', 'add', 'origin', 'git@github.com:acme/app.git')
    git(repo, 'checkout', '-q', '-b', 'dugout/42-fix-login')
    expect(await service.pullRequestUrl(repo)).toBe(
      'https://github.com/acme/app/compare/main...dugout/42-fix-login?expand=1&body=Closes+%2342',
    )
  })

  test('refuses to open a pull request from the base branch itself', async () => {
    const repo = makeFeatureRepo()
    git(repo, 'checkout', '-q', 'main')
    await expect(service.pullRequestUrl(repo)).rejects.toThrow('feature branch')
  })
})

describe('GitService worktrees', () => {
  test('adds, lists and removes a worktree on a new branch', async () => {
    const repo = makeRepoWithCommit()
    const worktree = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-wt-'))), 'session')

    await service.addWorktree(repo, worktree, 'dugout/session')

    expect(await service.listWorktrees(repo)).toEqual([
      { path: repo, branch: 'main' },
      { path: worktree, branch: 'dugout/session' },
    ])
    expect(readFileSync(join(worktree, 'readme.md'), 'utf8')).toBe('hello\n')

    await service.removeWorktree(repo, worktree)
    expect(await service.listWorktrees(repo)).toEqual([{ path: repo, branch: 'main' }])
  })

  test('refuses to remove a worktree with uncommitted work', async () => {
    const repo = makeRepoWithCommit()
    const worktree = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-wt-'))), 'dirty')
    await service.addWorktree(repo, worktree, 'dugout/dirty')
    writeFileSync(join(worktree, 'wip.txt'), 'unsaved\n')

    await expect(service.removeWorktree(repo, worktree)).rejects.toThrow(/modified or untracked/)
  })
})

describe('GitService revisions', () => {
  test('reads a file as it is in HEAD and in the index', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, 'readme.md'), 'staged\n')
    git(repo, 'add', 'readme.md')
    writeFileSync(join(repo, 'readme.md'), 'working\n')

    expect(await service.showFile(repo, 'HEAD', 'readme.md')).toEqual({
      content: 'hello\n',
      exists: true,
      isBinary: false,
    })
    expect((await service.showFile(repo, 'INDEX', 'readme.md')).content).toBe('staged\n')
  })

  test('reports files that do not exist at a revision', async () => {
    const repo = makeRepoWithCommit()
    expect(await service.showFile(repo, 'HEAD', 'new.ts')).toEqual({
      content: '',
      exists: false,
      isBinary: false,
    })
  })

  test('works before the first commit', async () => {
    const repo = makeRepo()
    expect((await service.showFile(repo, 'HEAD', 'a.txt')).exists).toBe(false)
  })

  test('tells which paths are gitignored', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, '.gitignore'), 'dist/\n*.log\n')
    mkdirSync(join(repo, 'dist'))
    expect(await service.checkIgnored(repo, ['dist', 'app.log', 'src', 'readme.md'])).toEqual(
      new Set(['dist', 'app.log']),
    )
  })
})

describe('GitService.clone', () => {
  function makeBareRemote(): string {
    const source = makeRepoWithCommit()
    const remote = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-clone-src-'))), 'app.git')
    git(source, 'clone', '-q', '--bare', source, remote)
    return remote
  }

  test('clones into a new folder and reports progress', async () => {
    const remote = makeBareRemote()
    const destination = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-clone-'))), 'app')
    const phases: string[] = []

    await service.clone(remote, destination, { onProgress: (p) => phases.push(p.phase) })

    expect(readFileSync(join(destination, 'readme.md'), 'utf8')).toBe('hello\n')
    expect(phases.length).toBeGreaterThan(0)
  })

  test('refuses a destination that already has files', async () => {
    const destination = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-clone-')))
    writeFileSync(join(destination, 'keep.txt'), 'mine')
    await expect(service.clone(makeBareRemote(), destination)).rejects.toThrow('not empty')
    expect(readFileSync(join(destination, 'keep.txt'), 'utf8')).toBe('mine')
  })

  test('cleans up the folder it created when the clone fails', async () => {
    const destination = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-clone-'))), 'app')
    await expect(service.clone('/no/such/repo.git', destination)).rejects.toThrow()
    expect(existsSync(destination)).toBe(false)
  })

  test('can be cancelled', async () => {
    const destination = join(realpathSync(mkdtempSync(join(tmpdir(), 'dugout-clone-'))), 'app')
    const controller = new AbortController()
    controller.abort()
    await expect(
      service.clone(makeBareRemote(), destination, { signal: controller.signal }),
    ).rejects.toThrow('cancelled')
    expect(existsSync(destination)).toBe(false)
  })
})

describe('GitService.changesSince', () => {
  test('lists committed, uncommitted and new files since the base branch', async () => {
    const repo = makeRepoWithCommit()
    git(repo, 'checkout', '-q', '-b', 'work')
    writeFileSync(join(repo, 'committed.ts'), 'a\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'work')
    writeFileSync(join(repo, 'readme.md'), 'edited\n')
    writeFileSync(join(repo, 'new.ts'), 'n\n')

    const changes = await service.changesSince(repo, 'main')

    expect(changes).toEqual([
      { path: 'committed.ts', kind: 'added' },
      { path: 'new.ts', kind: 'added' },
      { path: 'readme.md', kind: 'modified' },
    ])
  })
})
