import { execFile } from 'node:child_process'
import { AGENT_KINDS, type AgentKind } from '@shared/terminal'
import type { AgentCliCheck, AgentCliStatus } from '@shared/welcome'
import { buildTerminalEnv, resolveShell, type Env } from '../terminal/launchSpec'

/** Shell profiles can be slow (nvm, conda); past this the answer is "could not check". */
const CHECK_TIMEOUT_MS = 10_000
/** Plain "$VAR" only (decision 013), so it works in zsh, bash and fish. */
const LOOKUP_COMMAND = 'command -v "$DUGOUT_CHECK_COMMAND"'

export type ShellRunResult =
  | { readonly kind: 'exited'; readonly exitCode: number; readonly stdout: string }
  | { readonly kind: 'failed' }

/** Runs a command line in the user's login shell with extra environment variables. */
export type ShellRunner = (
  commandLine: string,
  extraEnv: Record<string, string>,
) => Promise<ShellRunResult>

/** Looks each agent's command up the way its terminal will run it: in an interactive login shell. */
export async function checkAgentClis(
  run: ShellRunner,
  commands: Readonly<Record<AgentKind, string>>,
): Promise<AgentCliCheck> {
  const statuses = await Promise.all(
    AGENT_KINDS.map(async (kind) => {
      const result = await run(LOOKUP_COMMAND, { DUGOUT_CHECK_COMMAND: commands[kind] })
      return [kind, toStatus(result)] as const
    }),
  )
  return Object.fromEntries(statuses) as Record<AgentKind, AgentCliStatus>
}

function toStatus(result: ShellRunResult): AgentCliStatus {
  if (result.kind === 'failed') return { state: 'unknown' }
  if (result.exitCode !== 0) return { state: 'missing' }
  // Interactive profiles may print banners first; the lookup's answer is the last line.
  const path = result.stdout.trim().split('\n').at(-1)?.trim()
  return path ? { state: 'installed', path } : { state: 'missing' }
}

/** The real runner: `$SHELL -l -i -c …` with the same environment terminals get. */
export function loginShellRunner(env: Env): ShellRunner {
  const shell = resolveShell(env)
  return (commandLine, extraEnv) =>
    new Promise((resolve) => {
      execFile(
        shell,
        ['-l', '-i', '-c', commandLine],
        { env: { ...buildTerminalEnv(env), ...extraEnv }, timeout: CHECK_TIMEOUT_MS },
        (error, stdout) => {
          if (!error) return resolve({ kind: 'exited', exitCode: 0, stdout })
          // A numeric code means the shell ran and the lookup failed; anything else (timeout,
          // missing shell) means we could not tell.
          if (typeof error.code === 'number' && !error.killed) {
            return resolve({ kind: 'exited', exitCode: error.code, stdout })
          }
          console.warn('[welcome] agent CLI check failed:', error.message)
          resolve({ kind: 'failed' })
        },
      )
    })
}
