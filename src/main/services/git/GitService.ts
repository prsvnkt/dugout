import { readdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CloneProgress } from '@shared/clone'
import { MAX_OPEN_FILE_BYTES, type GitRevision, type RevisionContent } from '@shared/files'
import type { GitBranch, GitChangeKind, GitStatus } from '@shared/git'
import type { GitCredentialConfig } from '../github/gitCredentials'
import { cloneProgressHandler } from './cloneProgressHandler'
import { parseNumstat, withLineStats } from './lineStats'
import { BRANCH_FORMAT, parseBranches } from './parseBranches'
import { parseStatus } from './parseStatus'
import { buildPullRequestUrl } from './pullRequestUrl'
import { GitError, runGit, type RunGitOptions } from './runGit'
import { untrackedLineStats } from './untrackedLineStats'

type Env = Readonly<Record<string, string | undefined>>

export interface GitServiceDeps {
  readonly env: Env
  /** Credentials for network commands (push, clone), e.g. the signed-in GitHub token. */
  readonly credentials?: () => GitCredentialConfig | Promise<GitCredentialConfig>
}

const PUSH_TIMEOUT_MS = 120_000
const FETCH_TIMEOUT_MS = 120_000
const CLONE_TIMEOUT_MS = 30 * 60_000
/**
 * Network commands name git's default pack command themselves: one set in `.git/config` runs
 * locally (for local and file:// remotes) with the token in its env. `--no-verify` backs up the
 * disabled hooks, since pre-push would see the token too (decision 052).
 */
const PUSH_ARGS = [
  'push',
  '--no-verify',
  '--no-recurse-submodules',
  '--receive-pack=git-receive-pack',
]
const FETCH_ARGS = ['fetch', '--prune', '--no-recurse-submodules', '--upload-pack=git-upload-pack']
/** `git check-ignore` exits 1 when nothing is ignored. */
const CHECK_IGNORE_OK = [0, 1]
const MISSING_AT_REVISION =
  /does not exist|exists on disk, but not in|invalid object name|bad revision|not in the index/i
/** `git branch -d` exits 1 when the branch has unmerged work (it is then kept). */
const BRANCH_DELETE_OK = [0, 1]
/** `git check-ref-format` exits 1 for an invalid name. */
const CHECK_REF_FORMAT_OK = [0, 1]
/** `git symbolic-ref --quiet` exits 1 when the ref does not exist. */
const OPTIONAL_REF_OK = [0, 1]
const FALLBACK_BASE_BRANCH = 'main'
const CHANGE_KINDS: Readonly<Record<string, GitChangeKind>> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  T: 'type-changed',
}

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
    const [{ stdout }, { stdout: staged }, { stdout: unstaged }, baseBranch] = await Promise.all([
      this.run(root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
      this.run(root, ['diff', '--cached', '--numstat', '-z']),
      this.run(root, ['diff', '--numstat', '-z']),
      this.baseBranch(root),
    ])
    const status = parseStatus(stdout)
    const untrackedPaths = status.files
      .filter((file) => file.unstaged === 'untracked')
      .map((file) => file.path)
    const files = withLineStats(status.files, {
      staged: parseNumstat(staged),
      unstaged: parseNumstat(unstaged),
      untracked: await untrackedLineStats(root, untrackedPaths),
    })
    return { ...status, files, baseBranch }
  }

  /**
   * The page for opening a pull request from the current branch into the base branch.
   * `taskKey` writes a task number the way its source does ("#12", or "ENG-12" for Linear).
   */
  async pullRequestUrl(
    root: string,
    taskKey: (taskNumber: number) => string = (taskNumber) => `#${taskNumber}`,
  ): Promise<string> {
    const status = await this.status(root)
    const base = status.baseBranch ?? FALLBACK_BASE_BRANCH
    if (status.branch === null || status.isUnborn) {
      throw new GitError('Check out a feature branch to create a pull request.')
    }
    if (status.branch === base) {
      throw new GitError(`You are on ${base}. Switch to a feature branch to create a pull request.`)
    }
    const { stdout } = await this.run(root, ['remote', 'get-url', 'origin'])
    // Branches started from a task (dugout/<number>-…) close it when the PR merges.
    const taskNumber = /^dugout\/(\d+)-/.exec(status.branch)?.[1]
    return buildPullRequestUrl(
      stdout,
      base,
      status.branch,
      taskNumber ? `Closes ${taskKey(Number(taskNumber))}` : undefined,
    )
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

  /** Commits what is staged, or with `includeAll` every change including new files. */
  async commit(
    root: string,
    message: string,
    options: { includeAll?: boolean } = {},
  ): Promise<void> {
    if (options.includeAll) await this.run(root, ['add', '--all'])
    // The user's own commit runs their hooks (lint-staged, commit-msg); no token is present.
    await this.run(root, ['commit', '--quiet', '--file=-'], { input: message, hooks: 'repo' })
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
      const args = ['clone', '--progress', '--upload-pack=git-upload-pack', '--', url, destination]
      await this.runNetwork(parent, args, {
        timeoutMs: CLONE_TIMEOUT_MS,
        ...(options.signal && { signal: options.signal }),
        ...(options.onProgress && { onStderr: cloneProgressHandler(options.onProgress) }),
      })
    } catch (error) {
      if (isCreatedHere) await rm(destination, { recursive: true, force: true })
      throw error
    }
  }

  /**
   * Updates every remote-tracking branch, dropping ones deleted on the remote. Never touches
   * files. Fetches one remote at a time, like `fetch --all`, which would not pass `--upload-pack`
   * on to the fetches it starts; every remote is tried, then the failures are reported.
   */
  async fetch(root: string): Promise<void> {
    const remotes = await this.remotes(root)
    const failures = await remotes.reduce<Promise<readonly string[]>>(async (previous, remote) => {
      const failed = await previous
      const failure = await this.fetchRemote(root, remote)
      return failure === null ? failed : [...failed, failure]
    }, Promise.resolve([]))
    if (failures.length > 0) throw new GitError(failures.join('\n'))
  }

  /** Pushes the current branch, publishing it to origin when it has no upstream yet. */
  async push(root: string): Promise<void> {
    const status = await this.status(root)
    if (status.branch === null) throw new GitError('Check out a branch before pushing.')
    if (status.upstream !== null) {
      await this.runNetwork(root, PUSH_ARGS, { timeoutMs: PUSH_TIMEOUT_MS })
      return
    }
    if (!(await this.remotes(root)).includes('origin')) {
      throw new GitError('This repository has no remote named "origin".')
    }
    await this.runNetwork(root, [...PUSH_ARGS, '--set-upstream', 'origin', 'HEAD'], {
      timeoutMs: PUSH_TIMEOUT_MS,
    })
  }

  /** Fetches one remote; resolves its error message, or null when it succeeded. */
  private async fetchRemote(root: string, remote: string): Promise<string | null> {
    try {
      await this.runNetwork(root, [...FETCH_ARGS, '--end-of-options', remote], {
        timeoutMs: FETCH_TIMEOUT_MS,
      })
      return null
    } catch (error) {
      return `${remote}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  private async remotes(root: string): Promise<string[]> {
    const { stdout } = await this.run(root, ['remote'])
    return stdout.split('\n').filter((name) => name.length > 0)
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

  /**
   * Everything that differs from where the branch left `base`: committed, uncommitted and new
   * files. Used to compare what two agents changed in their worktrees.
   */
  async changesSince(root: string, base: string): Promise<{ path: string; kind: GitChangeKind }[]> {
    const mergeBase = await this.mergeBase(root, base)
    const [{ stdout: diff }, { stdout: untracked }] = await Promise.all([
      this.run(root, ['diff', '--name-status', '--no-renames', '-z', mergeBase]),
      this.run(root, ['ls-files', '--others', '--exclude-standard', '-z']),
    ])
    const fields = diff.split('\0').filter(Boolean)
    const changes = new Map<string, GitChangeKind>()
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const kind = CHANGE_KINDS[fields[index]?.[0] ?? ''] ?? 'modified'
      changes.set(fields[index + 1] ?? '', kind)
    }
    for (const path of untracked.split('\0').filter(Boolean)) changes.set(path, 'added')
    return [...changes]
      .map(([path, kind]) => ({ path, kind }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  /** Where the branch left `base` (or origin/`base`); HEAD when neither exists. */
  private async mergeBase(root: string, base: string): Promise<string> {
    for (const candidate of [base, `origin/${base}`]) {
      const { stdout } = await this.run(root, ['merge-base', 'HEAD', candidate], {
        okExitCodes: [0, 1, 128],
      })
      if (stdout.trim()) return stdout.trim()
    }
    return 'HEAD'
  }

  /** Local branches, then remote-only ones, each newest first. */
  async listBranches(root: string): Promise<GitBranch[]> {
    const [{ stdout }, { stdout: topLevel }] = await Promise.all([
      this.run(root, [
        'for-each-ref',
        '--sort=-committerdate',
        `--format=${BRANCH_FORMAT}`,
        'refs/heads',
        'refs/remotes',
      ]),
      this.run(root, ['rev-parse', '--show-toplevel']),
    ])
    return parseBranches(stdout, topLevel.trim())
  }

  /**
   * Checks out an existing branch; uncommitted edits come along (git refuses if they would be
   * overwritten). A remote branch becomes a new local branch that tracks it.
   */
  async switchBranch(
    root: string,
    target: { kind: GitBranch['kind']; name: string },
  ): Promise<void> {
    const branch = (await this.listBranches(root)).find(
      (candidate) => candidate.kind === target.kind && candidate.name === target.name,
    )
    if (!branch) throw new GitError(`There is no branch named "${target.name}".`)
    const args =
      branch.kind === 'remote'
        ? ['switch', '--track', branch.name]
        : ['switch', '--no-guess', branch.name]
    await this.run(root, args)
  }

  /** Creates `name` at HEAD (or at the existing branch `startPoint`) and switches to it. */
  async createBranch(root: string, name: string, startPoint?: string): Promise<void> {
    const valid = await this.validBranchName(root, name)
    if (startPoint !== undefined) {
      const isKnown = (await this.listBranches(root)).some((branch) => branch.name === startPoint)
      if (!isKnown) throw new GitError(`There is no branch named "${startPoint}".`)
    }
    await this.run(root, ['switch', '--create', valid, ...(startPoint ? [startPoint] : [])])
  }

  /** git's own rules (`check-ref-format`); also rejects names that look like options. */
  private async validBranchName(root: string, name: string): Promise<string> {
    const invalid = new GitError(`"${name}" is not a valid branch name.`)
    if (name.startsWith('-')) throw invalid
    const { stdout } = await this.run(root, ['check-ref-format', '--branch', name], {
      okExitCodes: CHECK_REF_FORMAT_OK,
    })
    if (!stdout.trim()) throw invalid
    return stdout.trim()
  }

  async branchExists(root: string, branch: string): Promise<boolean> {
    const { stdout } = await this.run(root, ['branch', '--list', '--', branch])
    return stdout.trim() !== ''
  }

  /** URL of the origin remote, or null when there is none. */
  async remoteUrl(root: string): Promise<string | null> {
    const { stdout } = await this.run(root, ['remote', 'get-url', 'origin'], {
      okExitCodes: [0, 2],
    })
    return stdout.trim() || null
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

  /**
   * Deletes a branch only if git considers it merged (`branch -d`); a branch with work found
   * nowhere else is kept. Resolves whether it was deleted.
   */
  async deleteBranchIfMerged(root: string, branch: string): Promise<boolean> {
    if (branch.startsWith('-')) throw new GitError(`"${branch}" is not a valid branch name.`)
    await this.run(root, ['branch', '--delete', branch], { okExitCodes: BRANCH_DELETE_OK })
    return !(await this.branchExists(root, branch))
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

  /**
   * Like `run`, with the configured credentials (e.g. GitHub token) for remote access. The token
   * must reach only Dugout's credential helper, so this never runs repository hooks
   * (decision 052); callers also name the pack command so `.git/config` cannot.
   */
  private async runNetwork(
    root: string,
    args: readonly string[],
    options: Partial<Omit<RunGitOptions, 'cwd' | 'args' | 'hooks'>> = {},
  ) {
    const credentials = (await this.deps.credentials?.()) ?? { args: [], env: {} }
    return this.run(root, [...credentials.args, ...args], {
      ...options,
      env: { ...this.env, ...credentials.env },
      hooks: 'none',
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
