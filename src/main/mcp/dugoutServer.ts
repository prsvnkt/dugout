import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerContextTools } from './contextTools'
import type { DugoutRpc } from './rpcTool'
import { registerTaskTools } from './taskTools'

/**
 * One line agents get when the server starts (MCP `instructions`), so they know project context
 * exists without anything being written into AGENTS.md or their prompt.
 */
export const DUGOUT_INSTRUCTIONS =
  'Dugout tools for this project: tasks (GitHub or Linear issues) and project context. Call list_context ' +
  'early to see notes, pinned files and a codemap the team keeps for agents.'

/**
 * The "dugout" MCP server: an agent's project tasks and context. It never sees tokens or other
 * projects; every call goes through Dugout, scoped to the agent's terminal.
 */
export function createDugoutServer(rpc: DugoutRpc): McpServer {
  const server = new McpServer(
    { name: 'dugout', version: '1.2.0' },
    { instructions: DUGOUT_INSTRUCTIONS },
  )
  registerTaskTools(server, rpc)
  registerContextTools(server, rpc)
  return server
}
