import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { gitCredentialConfig } from '../github/gitCredentials'
import { GitService } from './GitService'

// Decision 052: git that Dugout runs on its own behalf never runs commands that the repository's
// own config names (fsmonitor, hooks, askpass, upload-pack, …), and never hands them the token.

const TOKEN = 'gho_secret-test-token'
const IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

const service = new GitService({
  env: { ...process.env, ...IDENTITY_ENV },
  credentials: () => gitCredentialConfig(TOKEN, 'https://github.com'),
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...IDENTITY_ENV },
  })
}

/** A script that appends its arguments and every Dugout env var it sees to `marker`. */
function writeSpy(path: string, marker: string): string {
  writeFileSync(
    path,
    `#!/bin/sh\necho "ran $*" >> "${marker}"\nenv | grep DUGOUT >> "${marker}"\nexit 1\n`,
  )
  chmodSync(path, 0o755)
  return path
}

interface Fixture {
  readonly repo: string
  readonly remote: string
  readonly marker: string
  readonly spy: string
}

/** A repo with one commit, an `origin` bare remote, and a spy script. */
function makeFixture(): Fixture {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-gitsec-')))
  const marker = join(scratch, 'marker')
  const spy = writeSpy(join(scratch, 'spy.sh'), marker)
  const remote = join(scratch, 'remote.git')
  const repo = join(scratch, 'repo')
  git(scratch, 'init', '-q', '--bare', '-b', 'main', remote)
  git(scratch, 'init', '-q', '-b', 'main', repo)
  writeFileSync(join(repo, 'readme.md'), 'hello\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  git(repo, 'remote', 'add', 'origin', remote)
  return { repo, remote, marker, spy }
}

function readMarker(marker: string): string {
  return existsSync(marker) ? readFileSync(marker, 'utf8') : ''
}

describe('GitService ignores commands named by the repository', () => {
  test('status does not run a core.fsmonitor command from .git/config', async () => {
    const { repo, marker, spy } = makeFixture()
    git(repo, 'config', 'core.fsmonitor', spy)

    await service.status(repo)

    expect(readMarker(marker)).toBe('')
  })

  test('push runs no repository hook, so the token cannot reach one', async () => {
    // Arrange: hooks via core.hooksPath, as husky sets it up
    const { repo, remote, marker } = makeFixture()
    writeSpy(join(repo, '.git', 'hooks', 'pre-push'), marker)
    writeSpy(join(repo, '.git', 'hooks', 'reference-transaction'), marker)
    git(repo, 'config', 'core.hooksPath', '.git/hooks')

    // Act
    await service.push(repo)

    // Assert
    expect(readMarker(marker)).not.toContain(TOKEN)
    expect(readMarker(marker)).toBe('')
    expect(git(remote, 'log', '--oneline', 'main')).toContain('init')
  })

  test('push ignores a receive-pack command from .git/config', async () => {
    const { repo, remote, marker, spy } = makeFixture()
    git(repo, 'config', 'remote.origin.receivepack', spy)

    await service.push(repo)

    expect(readMarker(marker)).toBe('')
    expect(git(remote, 'log', '--oneline', 'main')).toContain('init')
  })

  test('fetch ignores upload-pack commands from .git/config on every remote', async () => {
    const { repo, remote, marker, spy } = makeFixture()
    git(repo, 'push', '-q', 'origin', 'main')
    git(repo, 'remote', 'add', 'odd=name', remote)
    git(repo, 'config', 'remote.origin.uploadpack', spy)
    git(repo, 'config', 'remote.odd=name.uploadpack', spy)

    await service.fetch(repo)

    expect(readMarker(marker)).toBe('')
  })

  test('network commands run neither core.askPass nor core.gitProxy from .git/config', async () => {
    const { repo, marker, spy } = makeFixture()
    git(repo, 'config', 'core.askPass', spy)
    git(repo, 'config', 'core.gitProxy', spy)
    git(repo, 'remote', 'add', 'web', 'https://127.0.0.1:9/repo.git')
    git(repo, 'remote', 'add', 'daemon', 'git://127.0.0.1:9/repo.git')

    await expect(service.fetch(repo)).rejects.toThrow()

    expect(readMarker(marker)).toBe('')
  })

  test('commit from the Git panel still runs the pre-commit hook, without the token', async () => {
    const { repo, marker } = makeFixture()
    writeSpy(join(repo, '.git', 'hooks', 'pre-commit'), marker)
    writeFileSync(join(repo, 'readme.md'), 'changed\n')

    // The spy hook exits 1, so the commit is refused as the user's hook asked.
    await expect(service.commit(repo, 'change', { includeAll: true })).rejects.toThrow()

    expect(readMarker(marker)).toContain('ran')
    expect(readMarker(marker)).not.toContain(TOKEN)
  })
})
