import { spawn } from 'node:child_process'
import { buildTerminalEnv, resolveShell, type Env } from '../terminal/launchSpec'
import type { CheckHandlers, CheckProcess } from './CheckRunner'

/**
 * Runs a check command the way the user's terminal would (`$SHELL -l -i -c`, so PATH and
 * profile match), with the environment terminals get. It runs in its own process group so
 * cancelling it also stops what it started (test runners, compilers).
 */
export function shellCheckSpawner(
  env: Env,
): (command: string, cwd: string, handlers: CheckHandlers) => CheckProcess {
  const shell = resolveShell(env)
  return (command, cwd, handlers) => {
    const child = spawn(shell, ['-l', '-i', '-c', command], {
      cwd,
      env: { ...buildTerminalEnv(env), NO_COLOR: '1' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8').on('data', handlers.onOutput)
    child.stderr.setEncoding('utf8').on('data', handlers.onOutput)
    child.on('error', (error) => handlers.onError(error.message))
    child.on('close', (code) => handlers.onExit(code))
    return {
      kill: () => {
        if (child.pid === undefined || child.exitCode !== null) return
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
      },
    }
  }
}
