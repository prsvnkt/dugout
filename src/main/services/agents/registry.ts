import type { AgentKind } from '@shared/agents'
import type { AgentAdapter } from './AgentAdapter'
import { claudeAdapter } from './claude/claudeAdapter'
import { codexAdapter } from './codex/codexAdapter'
import { opencodeAdapter } from './opencode/opencodeAdapter'

/** Every agent Dugout can run. Adding one means an adapter folder plus an entry here. */
export const AGENT_ADAPTERS: Readonly<Record<AgentKind, AgentAdapter>> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
}

export function agentAdapter(kind: AgentKind): AgentAdapter {
  return AGENT_ADAPTERS[kind]
}

/**
 * The command each agent runs: its default, or an override (tests use fakes). Overrides come
 * from `readOverrides`, which reads each adapter's `commandVariable`.
 */
export function agentCommands(
  overrides: Readonly<Partial<Record<AgentKind, string>>>,
): Record<AgentKind, string> {
  const entries = Object.values(AGENT_ADAPTERS).map(
    (adapter) =>
      [adapter.info.kind, overrides[adapter.info.kind] ?? adapter.defaultCommand] as const,
  )
  return Object.fromEntries(entries) as Record<AgentKind, string>
}
