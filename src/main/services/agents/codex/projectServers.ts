import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServer } from '@shared/agentConfig'
import { MCP_JSON, parseMcpJson } from '../../agentConfig/mcpJson'
import { tomlInline } from './codexConfig'
import { codexMcpServer } from './codexMcp'

/**
 * `-c` overrides that give a Codex agent the servers in its checkout's `.mcp.json`, as Claude Code
 * gets them. Read when the agent starts; servers Codex cannot express are left out.
 */
export function codexProjectServerOverrides(cwd: string): string[] {
  let servers: McpServer[]
  try {
    servers = parseMcpJson(readFileSync(join(cwd, MCP_JSON), 'utf8')).servers
  } catch {
    return []
  }
  return servers.flatMap((server) => {
    const result = codexMcpServer(server)
    return result.ok ? [`mcp_servers.${server.name}=${tomlInline(result.config)}`] : []
  })
}
