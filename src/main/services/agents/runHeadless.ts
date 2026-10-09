import { execFile } from 'node:child_process'
import { buildTerminalEnv, resolveShell, type Env } from '../terminal/launchSpec'
import type { AgentLaunch } from './AgentAdapter'

/** A codebase survey can take a while; past this it is stopped. */
const HEADLESS_TIMEOUT_MS = 10 * 60_000
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

/** Runs an adapter's headless launch in a folder and resolves to what it printed. */
export type HeadlessRunner = (launch: AgentLaunch, cwd: string, prompt: string) => Promise<string>

/**
 * The real runner: the user's interactive login shell (as agent terminals use, so PATH and
 * auth match), with the same cleaned environment, and the prompt in `$DUGOUT_HEADLESS_PROMPT`.
 */
export function loginShellHeadlessRunner(env: Env): HeadlessRunner {
  const shell = resolveShell(env)
  return (launch, cwd, prompt) =>
    new Promise((resolve, reject) => {
      execFile(
        shell,
        ['-l', '-i', '-c', launch.commandLine],
        {
          cwd,
          env: { ...buildTerminalEnv(env), ...launch.env, DUGOUT_HEADLESS_PROMPT: prompt },
          timeout: HEADLESS_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
        },
        (error, stdout, stderr) => {
          if (!error) return resolve(stdout)
          const reason = error.killed ? 'it took too long' : stderr.trim().split('\n').at(-1)
          reject(new Error(`The agent could not finish${reason ? `: ${reason}` : '.'}`))
        },
      )
    })
}
