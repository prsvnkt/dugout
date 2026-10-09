import type { AgentInfo } from '@shared/agents'
import type { McpServerEntry } from './dugoutMcp'

/** Private per-terminal files (MCP configs), written owner-only and removed when it exits. */
export interface TerminalFiles {
  /** Writes `content` for this terminal and returns the file's path. */
  write(terminalId: string, content: string): string
  remove(terminalId: string): void
}

/** What Dugout hands an adapter to start one agent terminal with status and task tools. */
export interface AgentLaunchContext {
  readonly terminalId: string
  readonly cwd: string
  /** App data folder, where `prepare` wrote the agent's static files. */
  readonly dataDir: string
  /** The CLI to run: the adapter's default, or a test's fake. */
  readonly command: string
  /** Continue the session in `$DUGOUT_RESUME_SESSION` (only if the agent can resume). */
  readonly isResuming: boolean
  /** Start with `$DUGOUT_INITIAL_PROMPT` as the first message. */
  readonly hasInitialPrompt: boolean
  /** Dugout's task server for this terminal; absent when it is not available. */
  readonly mcp?: { readonly server: McpServerEntry; readonly files: TerminalFiles }
}

export interface AgentLaunch {
  /**
   * Run by `$SHELL -l -i -c`. Values reach it through env vars, never spliced in, and only as
   * plain "$VAR" expansions: other forms split differently in bash and zsh, and fish lacks them.
   */
  readonly commandLine: string
  /** Variables the command line reads, on top of Dugout's shared ones. */
  readonly env: Readonly<Record<string, string>>
  /** Cleans up per-terminal files once the process exits. */
  readonly dispose?: () => void
}

/**
 * One agent CLI. Adapters only translate (command lines, config, hook formats); status rules,
 * the inbox, worktrees, tasks and resume stay shared, so agents cannot drift apart.
 */
export interface AgentAdapter {
  readonly info: AgentInfo
  /** The command on the user's PATH, e.g. `claude`. */
  readonly defaultCommand: string
  /** Env var that replaces the command (e2e tests point it at a fake CLI). */
  readonly commandVariable: string
  /** Writes the agent's static files (hook settings, plugins) when Dugout starts. */
  prepare?(dataDir: string): Promise<void>
  /** The launch with Dugout's hooks and task server. Without hooks, `defaultCommand` runs as is. */
  launch(context: AgentLaunchContext): AgentLaunch
}
