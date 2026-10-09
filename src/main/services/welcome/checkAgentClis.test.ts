import { describe, expect, it } from 'vitest'
import { checkAgentClis, type ShellRunner, type ShellRunResult } from './checkAgentClis'

const COMMANDS = { claude: 'claude', codex: 'codex', opencode: 'opencode' }

interface RunnerCall {
  readonly commandLine: string
  readonly env: Record<string, string>
}

/** Answers each lookup from a table keyed by the command being looked up. */
function fakeRunner(answers: Record<string, ShellRunResult>): {
  run: ShellRunner
  calls: RunnerCall[]
} {
  const calls: RunnerCall[] = []
  const run: ShellRunner = async (commandLine, env) => {
    calls.push({ commandLine, env })
    return answers[env.DUGOUT_CHECK_COMMAND ?? ''] ?? { kind: 'failed' }
  }
  return { run, calls }
}

describe('checkAgentClis', () => {
  it('reports the path of an installed agent and a missing one', async () => {
    // Arrange
    const { run } = fakeRunner({
      claude: { kind: 'exited', exitCode: 0, stdout: '/opt/homebrew/bin/claude\n' },
      codex: { kind: 'exited', exitCode: 1, stdout: '' },
      opencode: { kind: 'exited', exitCode: 0, stdout: '/Users/me/.opencode/bin/opencode\n' },
    })

    // Act
    const check = await checkAgentClis(run, COMMANDS)

    // Assert
    expect(check).toEqual({
      claude: { state: 'installed', path: '/opt/homebrew/bin/claude' },
      codex: { state: 'missing' },
      opencode: { state: 'installed', path: '/Users/me/.opencode/bin/opencode' },
    })
  })

  it('takes the last line when a shell profile prints a banner first', async () => {
    const { run } = fakeRunner({
      claude: { kind: 'exited', exitCode: 0, stdout: 'Welcome back!\n/usr/local/bin/claude\n' },
      codex: { kind: 'exited', exitCode: 0, stdout: '   \n' },
    })

    const check = await checkAgentClis(run, COMMANDS)

    expect(check.claude).toEqual({ state: 'installed', path: '/usr/local/bin/claude' })
    expect(check.codex).toEqual({ state: 'missing' })
  })

  it('says it could not check when the shell fails or times out', async () => {
    const { run } = fakeRunner({})

    const check = await checkAgentClis(run, COMMANDS)

    expect(check).toEqual({
      claude: { state: 'unknown' },
      codex: { state: 'unknown' },
      opencode: { state: 'unknown' },
    })
  })

  it('passes the command through the environment, never inside the command line', async () => {
    const { run, calls } = fakeRunner({})

    await checkAgentClis(run, { ...COMMANDS, claude: '/tmp/my claude' })

    expect(calls[0]).toEqual({
      commandLine: 'command -v "$DUGOUT_CHECK_COMMAND"',
      env: { DUGOUT_CHECK_COMMAND: '/tmp/my claude' },
    })
  })
})
