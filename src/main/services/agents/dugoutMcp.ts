/** How to start Dugout's bundled MCP server (task tools). */
export interface McpServerLaunch {
  /** The executable that runs the server (Electron, in Node mode). */
  readonly command: string
  readonly script: string
}

/** The terminal's own hook token, set in each agent's env (decision 059). */
export const HOOK_TOKEN_VARIABLE = 'DUGOUT_HOOK_TOKEN'

/** A stdio MCP server, in the shape every agent's config can be built from. */
export interface McpServerEntry {
  readonly command: string
  readonly args: readonly string[]
  /** Written into the agent's config: nothing secret. */
  readonly env: Readonly<Record<string, string>>
  /**
   * Variables the server reads from the agent's own environment and that never go into a config
   * file or argument. Claude Code and OpenCode pass their whole env to stdio servers; an agent
   * that does not (Codex) must forward these by name.
   */
  readonly inheritedEnv: readonly string[]
}

/**
 * The "dugout" server for one terminal: it needs to know which terminal (and project) it serves.
 * Its token comes from the agent's env, so no config file or command line carries it.
 */
export function dugoutMcpServer(
  launch: McpServerLaunch,
  socketPath: string,
  terminalId: string,
): McpServerEntry {
  return {
    command: launch.command,
    args: [launch.script],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DUGOUT_HOOK_SOCKET: socketPath,
      DUGOUT_TERMINAL_ID: terminalId,
    },
    inheritedEnv: [HOOK_TOKEN_VARIABLE],
  }
}
