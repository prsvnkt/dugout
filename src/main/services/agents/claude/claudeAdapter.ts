import { join } from 'node:path'
import { AGENTS } from '@shared/agents'
import { buildHookSettings } from '../../agentHooks/hookSettings'
import { readClaudeTimeline } from '../../transcripts/claudeTimeline'
import { readClaudeTranscript } from '../../transcripts/claudeTranscript'
import { findClaudeTranscript } from '../../transcripts/transcriptFiles'
import { writeFileAtomic } from '../../projects/atomicWrite'
import type { AgentAdapter, AgentLaunchContext } from '../AgentAdapter'

/** Hook settings shared by every Claude terminal, passed with `claude --settings`. */
export const CLAUDE_SETTINGS_FILE = 'claude-hooks.json'

/**
 * The prompt comes first: --mcp-config takes a list and would swallow anything after it.
 */
function commandLine(context: AgentLaunchContext, hasMcpConfig: boolean): string {
  return [
    '"$DUGOUT_CLAUDE_COMMAND"',
    ...(context.hasInitialPrompt ? ['"$DUGOUT_INITIAL_PROMPT"'] : []),
    '--settings "$DUGOUT_CLAUDE_SETTINGS"',
    ...(context.isResuming ? ['--resume "$DUGOUT_RESUME_SESSION"'] : []),
    ...(hasMcpConfig ? ['--mcp-config "$DUGOUT_MCP_CONFIG"'] : []),
  ].join(' ')
}

/** Claude Code: hooks from a settings file, the task server from a per-terminal MCP config. */
export const claudeAdapter: AgentAdapter = {
  info: AGENTS.claude,
  defaultCommand: 'claude',
  commandVariable: 'DUGOUT_CLAUDE_COMMAND',

  async prepare(dataDir) {
    const settings = `${JSON.stringify(buildHookSettings(), null, 2)}\n`
    await writeFileAtomic(join(dataDir, CLAUDE_SETTINGS_FILE), settings)
  },

  launch(context) {
    const { mcp, terminalId } = context
    const mcpConfigPath = mcp?.files.write(
      terminalId,
      JSON.stringify({ mcpServers: { dugout: { type: 'stdio', ...mcp.server } } }, null, 2),
    )
    return {
      commandLine: commandLine(context, mcpConfigPath !== undefined),
      env: {
        DUGOUT_CLAUDE_SETTINGS: join(context.dataDir, CLAUDE_SETTINGS_FILE),
        DUGOUT_CLAUDE_COMMAND: context.command,
        ...(mcpConfigPath && { DUGOUT_MCP_CONFIG: mcpConfigPath }),
      },
      ...(mcp && { dispose: () => mcp.files.remove(terminalId) }),
    }
  },

  // Hooks send `transcript_path`; SubagentStop sends `agent_transcript_path` for subagents.
  usage: {
    transcriptRoot: (homeDir, env) => env.CLAUDE_CONFIG_DIR || join(homeDir, '.claude'),
    read: (lines) => readClaudeTranscript(lines),
  },

  headless(command) {
    return {
      commandLine: '"$DUGOUT_CLAUDE_COMMAND" -p "$DUGOUT_HEADLESS_PROMPT"',
      env: { DUGOUT_CLAUDE_COMMAND: command },
    }
  },
  timeline: { find: findClaudeTranscript, read: readClaudeTimeline },
}
