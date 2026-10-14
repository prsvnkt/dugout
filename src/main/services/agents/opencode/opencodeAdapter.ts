import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AGENTS } from '@shared/agents'
import { PRE_APPROVED_TOOLS } from '../../../mcp/toolAccess'
import { writeFileAtomic } from '../../projects/atomicWrite'
import type { AgentAdapter, AgentLaunchContext } from '../AgentAdapter'
import type { McpServerEntry } from '../dugoutMcp'
import { OPENCODE_STATUS_PLUGIN } from './statusPlugin'

/** The status plugin, shared by every OpenCode terminal (`.mjs`: always an ES module). */
export const OPENCODE_PLUGIN_FILE = 'opencode-status.mjs'

/**
 * OpenCode's local MCP server config: the command as one array, env as `environment`. OpenCode
 * passes its own env to local servers too, so `inheritedEnv` needs no entry.
 */
function localMcpServer(server: McpServerEntry) {
  return {
    type: 'local',
    command: [server.command, ...server.args],
    environment: server.env,
  }
}

/**
 * OpenCode names MCP tools `<server>_<tool>` and applies the last matching permission rule, so
 * every dugout tool asks first and then the read and propose ones are allowed (decision 053).
 */
function dugoutPermissions(): Record<string, 'ask' | 'allow'> {
  return {
    'dugout_*': 'ask',
    ...Object.fromEntries(PRE_APPROVED_TOOLS.map((tool) => [`dugout_${tool}`, 'allow'])),
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
    ...(context.mcp && {
      mcp: { dugout: localMcpServer(context.mcp.server) },
      permission: dugoutPermissions(),
    }),
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
