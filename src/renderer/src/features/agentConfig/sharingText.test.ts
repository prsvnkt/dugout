import { describe, expect, test } from 'vitest'
import { AGENTS, type AgentInfo, type ProjectMcp } from '@shared/agents'
import { notSharedReasons, projectMcpText, sharingText } from './sharingText'

const SKIPPED = { isShared: false, reason: 'Codex does not support SSE servers.' } as const

/** A made-up agent, to show the text follows capabilities rather than kinds. */
function agent(label: string, projectMcp: ProjectMcp, needsMcpApproval = false): AgentInfo {
  const base = AGENTS.codex
  return {
    ...base,
    label,
    productName: `${label} CLI`,
    capabilities: { ...base.capabilities, projectMcp, needsMcpApproval },
  }
}

describe('sharingText', () => {
  test('names every agent that gets the server', () => {
    expect(sharingText({ claude: { isShared: true }, codex: { isShared: true } })).toBe(
      'Claude and Codex',
    )
    expect(sharingText(undefined)).toBe('Claude and Codex')
  })

  test('says which agents wait for approval (decision 057)', () => {
    const sharing = { claude: { isShared: true }, codex: { isShared: true } } as const
    expect(sharingText(sharing, false)).toBe('Claude, and Codex once approved')
  })

  test('says why an agent cannot use the server', () => {
    expect(sharingText({ claude: { isShared: true }, codex: SKIPPED }, false)).toBe(
      'Claude only: Codex does not support SSE servers.',
    )
    expect(notSharedReasons({ claude: { isShared: true }, codex: SKIPPED })).toBe(SKIPPED.reason)
    expect(notSharedReasons({ claude: { isShared: true } })).toBeUndefined()
  })

  test('works from capabilities for any set of agents', () => {
    const agents = [agent('Alpha', 'via-dugout', true), agent('Beta', 'native')]
    expect(sharingText(undefined, false, agents)).toBe('Beta, and Alpha once approved')
    expect(sharingText(undefined, false, [agents[0] as AgentInfo])).toBe('Alpha once approved')
    expect(sharingText({ codex: SKIPPED }, true, [agent('Gamma', 'via-dugout')])).toBe(
      'Not shared: Codex does not support SSE servers.',
    )
  })
})

describe('projectMcpText', () => {
  test('describes how each agent gets .mcp.json servers, by its capability', () => {
    expect(projectMcpText()).toBe(
      'Claude Code loads them itself and asks before it runs them; Codex agents get the ones ' +
        "Codex can run, once you approve them below; OpenCode agents get only Dugout's task " +
        'tools for now.',
    )
    expect(projectMcpText([agent('Delta', 'via-dugout')])).toBe(
      'Delta agents get the ones Delta can run.',
    )
  })
})
