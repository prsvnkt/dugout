import { describe, expect, test } from 'vitest'
import { AGENTS } from '@shared/agents'
import { APPROVAL_AGENTS, serverCommand, serverInputs, withheldText } from './serverSummary'

const LOCAL = {
  name: 'local',
  type: 'stdio',
  command: 'sh',
  args: ['-c', 'run'],
  env: { TOKEN: '${TOKEN}', MODE: 'ci' },
} as const

describe('serverSummary', () => {
  test('shows what a server runs and the names, never the values, of what it is given', () => {
    expect(serverCommand(LOCAL)).toBe('sh -c run')
    expect(serverInputs(LOCAL)).toBe('env: TOKEN, MODE')
    const docs = {
      name: 'd',
      type: 'http',
      url: 'https://d.dev',
      headers: { 'X-Key': 'v' },
    } as const
    expect(serverCommand(docs)).toBe('https://d.dev')
    expect(serverInputs(docs)).toBe('headers: X-Key')
    expect(serverInputs({ ...LOCAL, env: {} })).toBe('')
  })

  test('names the agents that need approval from their capabilities', () => {
    expect(APPROVAL_AGENTS).toBe(AGENTS.codex.label)
  })

  test('counts withheld servers in words', () => {
    expect(withheldText(1, 'Codex')).toBe(
      '1 project MCP server from .mcp.json is not shared with Codex until you approve it.',
    )
    expect(withheldText(2, 'Codex')).toBe(
      '2 project MCP servers from .mcp.json are not shared with Codex until you approve them.',
    )
  })
})
