import type { McpServer } from '@shared/agentConfig'
import { AGENT_LIST } from '@shared/agents'

/** What a server runs: its command line, or the URL it connects to. */
export function serverCommand(server: McpServer): string {
  return server.type === 'stdio' ? [server.command, ...server.args].join(' ') : server.url
}

/** The names of what a server is given (env vars, or headers), never their values. */
export function serverInputs(server: McpServer): string {
  const names = Object.keys(server.type === 'stdio' ? server.env : server.headers)
  if (names.length === 0) return ''
  return `${server.type === 'stdio' ? 'env' : 'headers'}: ${names.join(', ')}`
}

/**
 * The agents that get `.mcp.json` servers only once approved (decision 052), e.g. "Codex"; read
 * from their capabilities, so another such agent shows up without code here.
 */
export const APPROVAL_AGENTS = AGENT_LIST.filter((agent) => agent.capabilities.needsMcpApproval)
  .map((agent) => agent.label)
  .join(' and ')

/** "1 project MCP server … until you approve it" / "2 project MCP servers … them". */
export function withheldText(count: number, agentLabel: string): string {
  const servers = count === 1 ? '1 project MCP server' : `${count} project MCP servers`
  const verb = count === 1 ? 'is' : 'are'
  const pronoun = count === 1 ? 'it' : 'them'
  return `${servers} from .mcp.json ${verb} not shared with ${agentLabel} until you approve ${pronoun}.`
}
