import type { GitDiff, GitStatus } from '@shared/git'
import { parseStatus } from './parseStatus'
import { buildPullRequestUrl } from './pullRequestUrl'
import { GitError, runGit, type RunGitOptions } from './runGit'

type Env = Readonly<Record<string, string | undefined>>

export interface GitServiceDeps {
  readonly env: Env
}

const MAX_DIFF_BYTES = 1024 * 1024
const PUSH_TIMEOUT_MS = 120_000
const BINARY_DIFF = /^(Binary files .* differ|GIT binary patch)$/m
/** `git diff --no-index` exits 1 when the files differ. */
const DIFF_NO_INDEX_OK = [0, 1]
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

  constructor(deps: GitServiceDeps) {
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

  async diff(root: string, request: { path: string; staged: boolean }): Promise<GitDiff> {
    const isUntracked = !request.staged && !(await this.isTracked(root, request.path))
    const args = isUntracked
      ? ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', request.path]
      : [
          'diff',
          '--no-color',
          '--no-ext-diff',
          ...(request.staged ? ['--cached'] : []),
          '--',
          request.path,
        ]

    const { stdout, isTruncated } = await this.run(root, args, {
      maxOutputBytes: MAX_DIFF_BYTES,
      ...(isUntracked && { okExitCodes: DIFF_NO_INDEX_OK }),
    })
    return { ...request, text: stdout, isBinary: BINARY_DIFF.test(stdout), isTruncated }
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

  /** Pushes the current branch, publishing it to origin when it has no upstream yet. */
  async push(root: string): Promise<void> {
    const status = await this.status(root)
    if (status.branch === null) throw new GitError('Check out a branch before pushing.')
    if (status.upstream !== null) {
      await this.run(root, ['push'], { timeoutMs: PUSH_TIMEOUT_MS })
      return
    }
    const { stdout } = await this.run(root, ['remote'])
    if (!stdout.split('\n').includes('origin')) {
      throw new GitError('This repository has no remote named "origin".')
    }
    await this.run(root, ['push', '--set-upstream', 'origin', 'HEAD'], {
      timeoutMs: PUSH_TIMEOUT_MS,
    })
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

  private async isTracked(root: string, path: string): Promise<boolean> {
    const { stdout } = await this.run(root, ['ls-files', '-z', '--', path])
    return stdout.length > 0
  }

  private run(
    root: string,
    args: readonly string[],
    options: Partial<Omit<RunGitOptions, 'cwd' | 'args' | 'env'>> = {},
  ) {
    return runGit({ cwd: root, args, env: this.env, ...options })
  }
}
