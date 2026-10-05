import { readdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CloneProgress } from '@shared/clone'
import { MAX_OPEN_FILE_BYTES, type GitRevision, type RevisionContent } from '@shared/files'
import type { GitStatus } from '@shared/git'
import type { GitCredentialConfig } from '../github/gitCredentials'
import { cloneProgressHandler } from './cloneProgressHandler'
import { parseStatus } from './parseStatus'
import { buildPullRequestUrl } from './pullRequestUrl'
import { GitError, runGit, type RunGitOptions } from './runGit'

type Env = Readonly<Record<string, string | undefined>>

export interface GitServiceDeps {
  readonly env: Env
  /** Credentials for network commands (push, clone), e.g. the signed-in GitHub token. */
  readonly credentials?: () => GitCredentialConfig
}

const PUSH_TIMEOUT_MS = 120_000
const CLONE_TIMEOUT_MS = 30 * 60_000
/** `git check-ignore` exits 1 when nothing is ignored. */
const CHECK_IGNORE_OK = [0, 1]
const MISSING_AT_REVISION =
  /does not exist|exists on disk, but not in|invalid object name|bad revision|not in the index/i
/** `git symbolic-ref --quiet` exits 1 when the ref does not exist. */
const OPTIONAL_REF_OK = [0, 1]
const FALLBACK_BASE_BRANCH = 'main'

/**
 * Git operations for the review panel. Never prompts (no credential or editor prompts), never
 * takes optional locks (so refreshing cannot block an agent's own git commands), and treats
 * every path literally.
 */
export class GitService {
  private readonly env: Env

  constructor(private readonly deps: GitServiceDeps) {
    this.env = {
      ...deps.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_LITERAL_PATHSPECS: '1',
      GIT_SSH_COMMAND: deps.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
    }
  }

  async status(root: string): Promise<GitStatus> {
    const { stdout } = await this.run(root, [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=all',
    ])
    return { ...parseStatus(stdout), baseBranch: await this.baseBranch(root) }
  }

  /** The page for opening a pull request from the current branch into the base branch. */
  async pullRequestUrl(root: string): Promise<string> {
    const status = await this.status(root)
    const base = status.baseBranch ?? FALLBACK_BASE_BRANCH
    if (status.branch === null || status.isUnborn) {
      throw new GitError('Check out a feature branch to create a pull request.')
    }
    if (status.branch === base) {
      throw new GitError(`You are on ${base}. Switch to a feature branch to create a pull request.`)
    }
    const { stdout } = await this.run(root, ['remote', 'get-url', 'origin'])
    return buildPullRequestUrl(stdout, base, status.branch)
  }

  async stage(root: string, paths: readonly string[]): Promise<void> {
    await this.run(root, ['add', '--all', '--', ...paths])
  }

  async unstage(root: string, paths: readonly string[]): Promise<void> {
    const status = await this.status(root)
    // Unstaging a rename must also restore its original path.
    const withOriginals = status.files
      .filter((file) => paths.includes(file.path))
      .flatMap((file) => (file.originalPath ? [file.path, file.originalPath] : [file.path]))
    const targets = withOriginals.length > 0 ? withOriginals : [...paths]

    if (status.isUnborn) await this.run(root, ['rm', '--cached', '-r', '-q', '--', ...targets])
    else await this.run(root, ['restore', '--staged', '--', ...targets])
  }

  /** Reverts unstaged changes. Untracked files are deleted. */
  async discard(root: string, paths: readonly string[]): Promise<void> {
    const status = await this.status(root)
    const untracked = new Set(
      status.files.filter((file) => file.unstaged === 'untracked').map((file) => file.path),
    )
    const toClean = paths.filter((path) => untracked.has(path))
    const toRestore = paths.filter((path) => !untracked.has(path))

    if (toClean.length > 0) await this.run(root, ['clean', '-f', '-q', '--', ...toClean])
    if (toRestore.length > 0) await this.run(root, ['restore', '--worktree', '--', ...toRestore])
  }

  async commit(root: string, message: string): Promise<void> {
    await this.run(root, ['commit', '--quiet', '--file=-'], { input: message })
  }

  /**
   * Clones into `destination`, which must not exist or be an empty folder. On failure or cancel
   * the folder is removed again if this call created it.
   */
  async clone(
    url: string,
    destination: string,
    options: { onProgress?: (progress: CloneProgress) => void; signal?: AbortSignal } = {},
  ): Promise<void> {
    const existing = await readdir(destination).catch(() => null)
    if (existing && existing.length > 0) throw new GitError(`${destination} is not empty.`)
    const isCreatedHere = existing === null
    const parent = dirname(destination)
    try {
      await this.runNetwork(parent, ['clone', '--progress', '--', url, destination], {
        timeoutMs: CLONE_TIMEOUT_MS,
        ...(options.signal && { signal: options.signal }),
        ...(options.onProgress && { onStderr: cloneProgressHandler(options.onProgress) }),
      })
    } catch (error) {
      if (isCreatedHere) await rm(destination, { recursive: true, force: true })
      throw error
    }
  }

  /** Pushes the current branch, publishing it to origin when it has no upstream yet. */
  async push(root: string): Promise<void> {
    const status = await this.status(root)
    if (status.branch === null) throw new GitError('Check out a branch before pushing.')
    if (status.upstream !== null) {
      await this.runNetwork(root, ['push'], { timeoutMs: PUSH_TIMEOUT_MS })
      return
    }
    const { stdout } = await this.run(root, ['remote'])
    if (!stdout.split('\n').includes('origin')) {
      throw new GitError('This repository has no remote named "origin".')
    }
    await this.runNetwork(root, ['push', '--set-upstream', 'origin', 'HEAD'], {
      timeoutMs: PUSH_TIMEOUT_MS,
    })
  }

  /** A file as it is at HEAD or in the index (staged), for the original side of a diff. */
  async showFile(root: string, revision: GitRevision, path: string): Promise<RevisionContent> {
    const spec = revision === 'HEAD' ? `HEAD:${path}` : `:${path}`
    try {
      const { stdout } = await this.run(root, ['show', spec], {
        maxOutputBytes: MAX_OPEN_FILE_BYTES,
      })
      const isBinary = stdout.includes('\0')
      return { content: isBinary ? '' : stdout, exists: true, isBinary }
    } catch (error) {
      if (error instanceof GitError && MISSING_AT_REVISION.test(error.message)) {
        return { content: '', exists: false, isBinary: false }
      }
      throw error
    }
  }

  /** The subset of `paths` matched by .gitignore. */
  async checkIgnored(root: string, paths: readonly string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set()
    // check-ignore takes plain paths (never globs) and rejects the literal-pathspec setting.
    const { stdout } = await this.run(root, ['check-ignore', '-z', '--stdin'], {
      input: paths.join('\0') + '\0',
      okExitCodes: CHECK_IGNORE_OK,
      env: { ...this.env, GIT_LITERAL_PATHSPECS: '0' },
    })
    return new Set(stdout.split('\0').filter(Boolean))
  }

  async listWorktrees(root: string): Promise<{ path: string; branch: string | null }[]> {
    const { stdout } = await this.run(root, ['worktree', 'list', '--porcelain'])
    return stdout
      .split('\n\n')
      .filter((block) => block.startsWith('worktree '))
      .map((block) => {
        const lines = block.split('\n')
        const path = (lines[0] ?? '').slice('worktree '.length)
        const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'))
        return { path, branch: branchLine?.slice('branch refs/heads/'.length) ?? null }
      })
  }

  async addWorktree(root: string, path: string, branch: string): Promise<void> {
    await this.run(root, ['worktree', 'add', '--quiet', '-b', branch, path, 'HEAD'])
  }

  /** Fails (with git's explanation) if the worktree has uncommitted work. */
  async removeWorktree(root: string, path: string): Promise<void> {
    await this.run(root, ['worktree', 'remove', path])
  }

  private async baseBranch(root: string): Promise<string | null> {
    const { stdout } = await this.run(
      root,
      ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
      { okExitCodes: OPTIONAL_REF_OK },
    )
    const ref = stdout.trim()
    return ref.startsWith('origin/') ? ref.slice('origin/'.length) : null
  }

  /** Like `run`, with the configured credentials (e.g. GitHub token) for remote access. */
  private runNetwork(
    root: string,
    args: readonly string[],
    options: Partial<Omit<RunGitOptions, 'cwd' | 'args'>> = {},
  ) {
    const credentials = this.deps.credentials?.() ?? { args: [], env: {} }
    return this.run(root, [...credentials.args, ...args], {
      ...options,
      env: { ...this.env, ...credentials.env },
    })
  }

  private run(
    root: string,
    args: readonly string[],
    options: Partial<Omit<RunGitOptions, 'cwd' | 'args'>> = {},
  ) {
    return runGit({ cwd: root, args, env: this.env, ...options })
  }
}
