import type { AgentInfo, AgentKind } from '@shared/agents'

export interface TaskStartOption {
  readonly label: string
  readonly agents: readonly AgentKind[]
}

/**
 * "Start agent ▾" choices: each agent that can use the task tools on its own, then every pair of
 * them to compare (decision 021), each agent in its own worktree.
 */
export function taskStartOptions(agents: readonly AgentInfo[]): TaskStartOption[] {
  const usable = agents.filter((agent) => agent.capabilities.hasMcp)
  const singles = usable.map((agent) => ({ label: agent.label, agents: [agent.kind] }))
  const pairs = usable.flatMap((first, index) =>
    usable.slice(index + 1).map((second) => ({
      label: `${first.label} + ${second.label} (compare)`,
      agents: [first.kind, second.kind],
    })),
  )
  return [...singles, ...pairs]
}
