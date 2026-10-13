import type { AgentLaunchContext, TerminalFiles } from './AgentAdapter'

/** In-memory per-terminal files, for adapter tests. */
export function memoryFiles(): TerminalFiles & { readonly contents: Map<string, string> } {
  const contents = new Map<string, string>()
  return {
    contents,
    write(terminalId, content) {
      contents.set(terminalId, content)
      return `/data/mcp/${terminalId}.json`
    },
    remove(terminalId) {
      contents.delete(terminalId)
    },
  }
}

export const MCP_ENTRY = {
  command: '/Apps/Dugout',
  args: ['/out/main/mcp.js'],
  env: { ELECTRON_RUN_AS_NODE: '1', DUGOUT_TERMINAL_ID: 't-1' },
  inheritedEnv: ['DUGOUT_HOOK_TOKEN'],
}

/** A launch for terminal `t-1` in `/repo`, without the task server unless asked. */
export function launchContext(overrides: Partial<AgentLaunchContext> = {}): AgentLaunchContext {
  return {
    terminalId: 't-1',
    cwd: '/repo',
    dataDir: '/data',
    command: '/opt/fake/agent',
    isResuming: false,
    hasInitialPrompt: false,
    ...overrides,
  }
}
