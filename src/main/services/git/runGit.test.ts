import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { GitError, runGit, type RunGitOptions } from './runGit'

/** Decision 054: every git Dugout runs carries these overrides. */
const HARDENED = [
  '-c',
  'core.quotePath=false',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.askPass=',
  '-c',
  'protocol.ext.allow=never',
]
const NO_HOOKS = ['-c', 'core.hooksPath=/dev/null']

/**
 * A stand-in `git`, found first on PATH, for what a real git cannot be made to do on demand.
 * `STUB_MODE` picks the behaviour; every run logs its arguments and GIT_PROXY_COMMAND.
 */
const STUB_GIT = `#!/bin/sh
for arg in "$@"; do echo "arg:$arg" >> "$STUB_LOG"; done
env | grep '^GIT_PROXY_COMMAND=' >> "$STUB_LOG"
case "$STUB_MODE" in
  hang) echo "$$" > "$STUB_PID"; exec sleep 30 ;;
  flood) exec yes dugout ;;
  exit1) echo "partial"; exit 1 ;;
  hints) printf 'hint: try this\\nfatal: bad revision\\nhint: or that\\nerror: second problem\\n' >&2; exit 128 ;;
  silent) exit 2 ;;
  stdout-only) echo "fatal: from stdout"; exit 2 ;;
  close-stdin) exec 0<&-; echo done; exit 0 ;;
  progress) echo "Receiving objects: 50%" >&2; echo ok; exit 0 ;;
  *) echo ok; exit 0 ;;
esac
`

let scratch: string
let stubDir: string
let log: string
let pidFile: string

beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-rungit-')))
  stubDir = join(scratch, 'bin')
  mkdirSync(stubDir)
  writeFileSync(join(stubDir, 'git'), STUB_GIT)
  chmodSync(join(stubDir, 'git'), 0o755)
  log = join(scratch, 'log')
  pidFile = join(scratch, 'pid')
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function stub(mode: string, options: Partial<RunGitOptions> = {}) {
  rmSync(log, { force: true })
  return runGit({
    cwd: scratch,
    args: ['status'],
    env: {
      PATH: `${stubDir}:${process.env.PATH ?? ''}`,
      STUB_MODE: mode,
      STUB_LOG: log,
      STUB_PID: pidFile,
      GIT_PROXY_COMMAND: 'proxy-from-parent-env',
    },
    ...options,
  })
}

/** The arguments the stub was started with. */
function loggedArgs(): string[] {
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('arg:'))
    .map((line) => line.slice('arg:'.length))
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('runGit hardening (decision 054)', () => {
  test('puts the hardening and no-hooks overrides before the arguments', async () => {
    await stub('ok', { args: ['status', '--porcelain'] })

    expect(loggedArgs()).toEqual([...HARDENED, ...NO_HOOKS, 'status', '--porcelain'])
  })

  test("drops only the hooksPath override for hooks: 'repo'", async () => {
    await stub('ok', { args: ['commit', '-m', 'x'], hooks: 'repo' })

    expect(loggedArgs()).toEqual([...HARDENED, 'commit', '-m', 'x'])
  })

  test('sets GIT_PROXY_COMMAND to empty whatever the caller passed', async () => {
    await stub('ok')

    expect(readFileSync(log, 'utf8')).toContain('GIT_PROXY_COMMAND=\n')
    expect(readFileSync(log, 'utf8')).not.toContain('proxy-from-parent-env')
  })
})

describe('runGit failure modes', () => {
  test('rejects with "timed out" and kills git when it runs too long', async () => {
    rmSync(pidFile, { force: true })

    await expect(stub('hang', { timeoutMs: 300 })).rejects.toThrow('git status timed out.')

    expect(isRunning(Number(readFileSync(pidFile, 'utf8')))).toBe(false)
  })

  test('resolves with the first maxOutputBytes and isTruncated when output is too long', async () => {
    const result = await stub('flood', { maxOutputBytes: 1000 })

    expect(result.isTruncated).toBe(true)
    expect(Buffer.byteLength(result.stdout)).toBe(1000)
    expect(result.stdout.startsWith('dugout\ndugout\n')).toBe(true)
  })

  test('rejects a non-zero exit by default', async () => {
    await expect(stub('exit1')).rejects.toBeInstanceOf(GitError)
  })

  test('resolves an exit code listed in okExitCodes', async () => {
    const result = await stub('exit1', { okExitCodes: [0, 1] })

    expect(result).toEqual({ stdout: 'partial\n', isTruncated: false })
  })

  test('rejects with "cancelled" and kills git when the signal aborts', async () => {
    rmSync(pidFile, { force: true })
    const controller = new AbortController()

    const running = stub('hang', { signal: controller.signal })
    await expect.poll(() => existsSync(pidFile)).toBe(true)
    controller.abort()

    await expect(running).rejects.toThrow('git status was cancelled.')
    expect(isRunning(Number(readFileSync(pidFile, 'utf8')))).toBe(false)
  })

  test('does not start git for a signal that already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(stub('ok', { signal: controller.signal })).rejects.toThrow('was cancelled.')
    expect(existsSync(log)).toBe(false)
  })

  test('swallows EPIPE when git closes stdin before reading the input', async () => {
    const input = 'x'.repeat(8 * 1024 * 1024)

    const result = await stub('close-stdin', { input })

    expect(result.stdout).toBe('done\n')
  })

  test('streams stderr to onStderr', async () => {
    const chunks: string[] = []

    await stub('progress', { onStderr: (text) => chunks.push(text) })

    expect(chunks.join('')).toBe('Receiving objects: 50%\n')
  })

  test('reports a git that cannot start', async () => {
    const promise = stub('ok', { cwd: join(scratch, 'missing-folder') })

    await expect(promise).rejects.toThrow(/^Could not run git: /)
  })
})

describe('runGit error messages', () => {
  test('drops hint: lines and the fatal: / error: prefixes', async () => {
    await expect(stub('hints')).rejects.toThrow(/^bad revision\nsecond problem$/)
  })

  test('falls back to stdout when stderr is empty', async () => {
    await expect(stub('stdout-only')).rejects.toThrow(/^from stdout$/)
  })

  test('names the command when git printed nothing', async () => {
    await expect(stub('silent', { args: ['fetch'] })).rejects.toThrow(/^git fetch failed\.$/)
  })
})

describe('runGit with a real git', () => {
  let repo: string

  beforeAll(() => {
    repo = join(scratch, 'repo')
    mkdirSync(repo)
    execFileSync('git', ['init', '-q'], { cwd: repo })
    execFileSync('git', ['config', 'core.hooksPath', '.husky'], { cwd: repo })
    execFileSync('git', ['config', 'core.fsmonitor', 'echo'], { cwd: repo })
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    writeFileSync(join(repo, 'b.txt'), 'two\n')
  })

  const real = (args: string[], options: Partial<RunGitOptions> = {}) =>
    runGit({ cwd: repo, args, env: { PATH: process.env.PATH, HOME: scratch }, ...options })

  test('overrides the repository config for every call', async () => {
    const fsmonitor = await real(['config', 'core.fsmonitor'])
    const hooksPath = await real(['config', 'core.hooksPath'])

    expect(fsmonitor.stdout.trim()).toBe('false')
    expect(hooksPath.stdout.trim()).toBe('/dev/null')
  })

  test("keeps the repository's hooksPath for hooks: 'repo', and nothing else", async () => {
    const hooksPath = await real(['config', 'core.hooksPath'], { hooks: 'repo' })
    const fsmonitor = await real(['config', 'core.fsmonitor'], { hooks: 'repo' })

    expect(hooksPath.stdout.trim()).toBe('.husky')
    expect(fsmonitor.stdout.trim()).toBe('false')
  })

  test('resolves git diff --no-index, which exits 1 for a difference, with okExitCodes', async () => {
    const result = await real(['diff', '--no-index', 'a.txt', 'b.txt'], { okExitCodes: [0, 1] })

    expect(result.stdout).toContain('-one')
    expect(result.stdout).toContain('+two')
  })

  test('turns a fatal error into a readable message', async () => {
    await expect(real(['rev-parse', '--verify', 'no-such-ref'])).rejects.toThrow(
      /^Needed a single revision$/,
    )
  })
})
