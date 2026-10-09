import { AGENTS } from '@shared/agents'
import type { AgentAdapter, AgentLaunchContext } from '../AgentAdapter'
import { codexConfigOverrides } from './codexConfig'
import { codexProjectServerOverrides } from './projectServers'

/** `-c` overrides: status hooks, the dugout server, then the checkout's `.mcp.json` servers. */
function overridesFor(context: AgentLaunchContext): string[] {
  if (!context.mcp) return []
  return [...codexConfigOverrides(context.mcp.server), ...codexProjectServerOverrides(context.cwd)]
}

/** Each override goes in its own `$DUGOUT_CODEX_C<n>`, so the line stays plain "$VAR"s. */
function commandLine(context: AgentLaunchContext, overrideCount: number): string {
  const overrides = Array.from(
    { length: overrideCount },
    (_, index) => `-c "$DUGOUT_CODEX_C${index}"`,
  )
  const start = context.isResuming
    ? ['resume "$DUGOUT_RESUME_SESSION"']
    : context.hasInitialPrompt
      ? ['"$DUGOUT_INITIAL_PROMPT"']
      : []
  return ['"$DUGOUT_CODEX_COMMAND"', ...start, ...overrides].join(' ')
}

/** Codex CLI: the same hooks and the dugout server as `-c key=value` config overrides. */
export const codexAdapter: AgentAdapter = {
  info: AGENTS.codex,
  defaultCommand: 'codex',
  commandVariable: 'DUGOUT_CODEX_COMMAND',

  launch(context) {
    const overrides = overridesFor(context)
    return {
      commandLine: commandLine(context, overrides.length),
      env: {
        DUGOUT_CODEX_COMMAND: context.command,
        ...Object.fromEntries(overrides.map((value, index) => [`DUGOUT_CODEX_C${index}`, value])),
      },
    }
  },
}
