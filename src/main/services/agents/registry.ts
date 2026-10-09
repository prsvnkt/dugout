import type { AgentKind } from '@shared/agents'
import type { AgentAdapter } from './AgentAdapter'
import { claudeAdapter } from './claude/claudeAdapter'
import { codexAdapter } from './codex/codexAdapter'

/** Every agent Dugout can run. Adding one means an adapter folder plus an entry here. */
export const AGENT_ADAPTERS: Readonly<Record<AgentKind, AgentAdapter>> = {
  claude: claudeAdapter,
  codex: codexAdapter,
}

export function agentAdapter(kind: AgentKind): AgentAdapter {
  return AGENT_ADAPTERS[kind]
}

/** The command each agent runs: its default, or the override in `env` (tests use fakes). */
export function agentCommands(
  env: Readonly<Record<string, string | undefined>>,
): Record<AgentKind, string> {
  const entries = Object.values(AGENT_ADAPTERS).map(
    (adapter) =>
      [adapter.info.kind, env[adapter.commandVariable] ?? adapter.defaultCommand] as const,
  )
  return Object.fromEntries(entries) as Record<AgentKind, string>
}
