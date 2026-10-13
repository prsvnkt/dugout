import { spawn } from 'node:child_process'

/**
 * Whether git may run the repository's hooks. Only a user action whose hooks the user expects
 * (a commit from the Git panel) asks for `repo`; everything else gets `none` (decision 054).
 */
export type GitHooks = 'none' | 'repo'

export interface RunGitOptions {
  readonly cwd: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly input?: string
  readonly timeoutMs?: number
  /** Output beyond this is dropped and reported as truncated. */
  readonly maxOutputBytes?: number
  /** Exit codes that count as success (e.g. 1 for `git diff --no-index`). */
  readonly okExitCodes?: readonly number[]
  /** Receives stderr as it arrives (e.g. `--progress` output). */
  readonly onStderr?: (text: string) => void
  /** Kills git and rejects with "cancelled". */
  readonly signal?: AbortSignal
  /** Defaults to `none`. Never `repo` for a command that carries credentials. */
  readonly hooks?: GitHooks
}

export interface RunGitResult {
  readonly stdout: string
  readonly isTruncated: boolean
}

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024

export class GitError extends Error {
  override readonly name = 'GitError'
}

/** Turns git's output into a short message for the UI, dropping `hint:` noise. */
function readableError(stderr: string, stdout: string, args: readonly string[]): string {
  const lines = (stderr.trim() || stdout.trim())
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('hint:'))
  const message = lines.join('\n').replace(/^(fatal|error): /gm, '')
  return message || `git ${args[0] ?? ''} failed.`
}

/**
 * Overrides for every git Dugout runs, so a repository's own `.git/config` cannot make Dugout
 * run a command (decision 054). `-c` beats repo config, and child gits inherit it.
 */
const HARDENED_CONFIG: readonly string[] = [
  ...['-c', 'core.quotePath=false'],
  ...['-c', 'core.fsmonitor=false'],
  // Empty means no askpass program: a credential prompt fails (GIT_TERMINAL_PROMPT=0) instead.
  ...['-c', 'core.askPass='],
  ...['-c', 'protocol.ext.allow=never'],
]
const NO_HOOKS: readonly string[] = ['-c', 'core.hooksPath=/dev/null']
/** Set, even empty, it wins over `core.gitProxy` from repo config. */
const HARDENED_ENV = { GIT_PROXY_COMMAND: '' }

/** The full argument list for `args`, hardened. */
function gitArgs(args: readonly string[], hooks: GitHooks = 'none'): string[] {
  return [...HARDENED_CONFIG, ...(hooks === 'repo' ? [] : NO_HOOKS), ...args]
}

export function runGit(options: RunGitOptions): Promise<RunGitResult> {
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const okCodes = options.okExitCodes ?? [0]

  if (options.signal?.aborted) {
    return Promise.reject(new GitError(`git ${options.args[0] ?? ''} was cancelled.`))
  }
  return new Promise((resolve, reject) => {
    const child = spawn('git', gitArgs(options.args, options.hooks), {
      cwd: options.cwd,
      env: { ...options.env, ...HARDENED_ENV },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    let isTruncated = false
    let isTimedOut = false

    const timer = setTimeout(() => {
      isTimedOut = true
      child.kill()
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let isCancelled = false
    const cancel = () => {
      isCancelled = true
      child.kill()
    }
    if (options.signal?.aborted) cancel()
    options.signal?.addEventListener('abort', cancel, { once: true })

    child.stdout.on('data', (chunk: Buffer) => {
      if (isTruncated) return
      const room = maxBytes - stdoutBytes
      stdout.push(chunk.length > room ? chunk.subarray(0, room) : chunk)
      stdoutBytes += Math.min(chunk.length, room)
      if (chunk.length > room) {
        isTruncated = true
        child.kill()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
      options.onStderr?.(chunk.toString('utf8'))
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new GitError(`Could not run git: ${error.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', cancel)
      const out = Buffer.concat(stdout).toString('utf8')
      if (isCancelled) return reject(new GitError(`git ${options.args[0] ?? ''} was cancelled.`))
      if (isTimedOut) return reject(new GitError(`git ${options.args[0] ?? ''} timed out.`))
      if (isTruncated || okCodes.includes(code ?? -1)) return resolve({ stdout: out, isTruncated })
      const err = Buffer.concat(stderr).toString('utf8')
      reject(new GitError(readableError(err, out, options.args)))
    })

    // A killed (cancelled or timed-out) git closes its stdin early; that EPIPE is expected.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input ?? '')
  })
}
