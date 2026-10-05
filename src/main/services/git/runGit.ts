import { spawn } from 'node:child_process'

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

export function runGit(options: RunGitOptions): Promise<RunGitResult> {
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const okCodes = options.okExitCodes ?? [0]

  if (options.signal?.aborted) {
    return Promise.reject(new GitError(`git ${options.args[0] ?? ''} was cancelled.`))
  }
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotePath=false', ...options.args], {
      cwd: options.cwd,
      env: options.env,
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
