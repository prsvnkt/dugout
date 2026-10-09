import { describe, expect, test } from 'vitest'
import { AGENT_LIST, AGENTS } from '@shared/agents'
import { taskStartOptions } from './taskStartOptions'

describe('taskStartOptions', () => {
  test('offers each agent, then every pair of agents to compare', () => {
    expect(taskStartOptions([AGENTS.claude, AGENTS.codex])).toEqual([
      { label: 'Claude', agents: ['claude'] },
      { label: 'Codex', agents: ['codex'] },
      { label: 'Claude + Codex (compare)', agents: ['claude', 'codex'] },
    ])
  })

  test('leaves out agents that cannot use the task tools', () => {
    const noMcp = { ...AGENTS.codex, capabilities: { ...AGENTS.codex.capabilities, hasMcp: false } }
    expect(taskStartOptions([AGENTS.claude, noMcp])).toEqual([
      { label: 'Claude', agents: ['claude'] },
    ])
  })

  test('covers every registered agent', () => {
    const singles = taskStartOptions(AGENT_LIST).filter((option) => option.agents.length === 1)
    expect(singles.map((option) => option.agents[0])).toEqual(AGENT_LIST.map((agent) => agent.kind))
  })
})
