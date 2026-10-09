/** How to start Dugout's bundled MCP server (task tools). */
export interface McpServerLaunch {
  /** The executable that runs the server (Electron, in Node mode). */
  readonly command: string
  readonly script: string
}

/** A stdio MCP server, in the shape every agent's config can be built from. */
export interface McpServerEntry {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** The "dugout" server for one terminal: it needs to know which terminal (and project) it serves. */
export function dugoutMcpServer(
  launch: McpServerLaunch,
  socketPath: string,
  token: string,
  terminalId: string,
): McpServerEntry {
  return {
    command: launch.command,
    args: [launch.script],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DUGOUT_HOOK_SOCKET: socketPath,
      DUGOUT_HOOK_TOKEN: token,
      DUGOUT_TERMINAL_ID: terminalId,
    },
  }
}
