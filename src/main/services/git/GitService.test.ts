import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
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
        { path: 'readme.md', staged: null, unstaged: 'modified' },
        { path: 'new*file.ts', staged: null, unstaged: 'untracked' },
        { path: 'src/staged.ts', staged: 'added', unstaged: null },
      ]),
    )
  })

  test('does not take the index lock, so it never blocks an agent', async () => {
    const repo = makeRepoWithCommit()
    writeFileSync(join(repo, '.git', 'index.lock'), '')
    await expect(service.status(repo)).resolves.toMatchObject({ branch: 'main' })
  })
})

describe('GitService.diff', () => {
  let repo: string

  beforeEach(() => {
    repo = makeRepoWithCommit()
  })

  test('shows unstaged and staged changes separately', async () => {
    writeFileSync(join(repo, 'readme.md'), 'staged\n')
    git(repo, 'add', 'readme.md')
    writeFileSync(join(repo, 'readme.md'), 'unstaged\n')

    const unstaged = await service.diff(repo, { path: 'readme.md', staged: false })
    const staged = await service.diff(repo, { path: 'readme.md', staged: true })

    expect(unstaged.text).toContain('-staged\n+unstaged')
    expect(staged.text).toContain('-hello\n+staged')
  })

  test('shows an untracked file as all additions', async () => {
    writeFileSync(join(repo, 'fresh.txt'), 'one\ntwo\n')
    const diff = await service.diff(repo, { path: 'fresh.txt', staged: false })
    expect(diff.text).toContain('+one\n+two')
    expect(diff.isBinary).toBe(false)
  })

  test('detects binary files', async () => {
    writeFileSync(join(repo, 'image.bin'), Buffer.from([0, 1, 2, 0, 255]))
    const diff = await service.diff(repo, { path: 'image.bin', staged: false })
    expect(diff.isBinary).toBe(true)
  })

  test('truncates very large diffs', async () => {
    writeFileSync(join(repo, 'big.txt'), 'line of text\n'.repeat(400_000))
    const diff = await service.diff(repo, { path: 'big.txt', staged: false })
    expect(diff.isTruncated).toBe(true)
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
      { path: 'a.txt', staged: null, unstaged: 'untracked' },
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

  test('refuses to open a pull request from the base branch itself', async () => {
    const repo = makeFeatureRepo()
    git(repo, 'checkout', '-q', 'main')
    await expect(service.pullRequestUrl(repo)).rejects.toThrow('feature branch')
  })
})
