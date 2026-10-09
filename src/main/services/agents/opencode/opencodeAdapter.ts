import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AGENTS } from '@shared/agents'
import { writeFileAtomic } from '../../projects/atomicWrite'
import type { AgentAdapter, AgentLaunchContext } from '../AgentAdapter'
import type { McpServerEntry } from '../dugoutMcp'
import { OPENCODE_STATUS_PLUGIN } from './statusPlugin'

/** The status plugin, shared by every OpenCode terminal (`.mjs`: always an ES module). */
export const OPENCODE_PLUGIN_FILE = 'opencode-status.mjs'

/** OpenCode's local MCP server config: the command as one array, env as `environment`. */
function localMcpServer(server: McpServerEntry) {
  return {
    type: 'local',
    command: [server.command, ...server.args],
    environment: server.env,
  }
}

/**
 * Inline config OpenCode merges over the user's own (`OPENCODE_CONFIG_CONTENT`): plugin lists are
 * concatenated and MCP servers added by name, so nothing of theirs is replaced or rewritten.
 */
function inlineConfig(context: AgentLaunchContext): string {
  const pluginUrl = pathToFileURL(join(context.dataDir, OPENCODE_PLUGIN_FILE)).href
  return JSON.stringify({
    plugin: [pluginUrl],
    ...(context.mcp && { mcp: { dugout: localMcpServer(context.mcp.server) } }),
  })
}

function commandLine(context: AgentLaunchContext): string {
  return [
    '"$DUGOUT_OPENCODE_COMMAND"',
    ...(context.isResuming ? ['--session "$DUGOUT_RESUME_SESSION"'] : []),
    ...(context.hasInitialPrompt ? ['--prompt "$DUGOUT_INITIAL_PROMPT"'] : []),
  ].join(' ')
}

/** OpenCode: status from a plugin, the task server as inline config, resume with `--session`. */
export const opencodeAdapter: AgentAdapter = {
  info: AGENTS.opencode,
  defaultCommand: 'opencode',
  commandVariable: 'DUGOUT_OPENCODE_COMMAND',

  async prepare(dataDir) {
    await writeFileAtomic(join(dataDir, OPENCODE_PLUGIN_FILE), OPENCODE_STATUS_PLUGIN)
  },

  launch(context) {
    return {
      commandLine: commandLine(context),
      env: {
        DUGOUT_OPENCODE_COMMAND: context.command,
        OPENCODE_CONFIG_CONTENT: inlineConfig(context),
      },
    }
  },
}
