/**
 * The agent CLIs Dugout runs, as the renderer sees them. Each one has an adapter in main
 * (`src/main/services/agents/<kind>/`); adding an agent means one adapter plus an entry here.
 * Ids are saved in layouts, settings and task worktrees, so they never change.
 */
export const AGENT_KINDS = ['claude', 'codex', 'opencode'] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

/** What an agent supports. The UI hides what an agent cannot do instead of checking its kind. */
export interface AgentCapabilities {
  /** Ready / working / needs you / done from hooks or a plugin; otherwise only "Running". */
  readonly hasStatus: boolean
  /** Gets Dugout's "dugout" MCP server (task tools), so it can work on tasks. */
  readonly hasMcp: boolean
  /** Can continue a conversation by session id after a restart. */
  readonly canResume: boolean
  /** Dugout can read its token usage (none yet; see issue #35). */
  readonly hasUsage: boolean
}

export interface AgentInfo {
  readonly kind: AgentKind
  /** Short name in menus, lists and the inbox: "Claude". */
  readonly label: string
  /** The agent's own name, in its terminal header: "Claude Code". */
  readonly productName: string
  /** The CLI's name on the welcome screen's agent check: "Codex CLI". */
  readonly cliName: string
  readonly installCommand: string
  readonly capabilities: AgentCapabilities
}

export const AGENTS: Readonly<Record<AgentKind, AgentInfo>> = {
  claude: {
    kind: 'claude',
    label: 'Claude',
    productName: 'Claude Code',
    cliName: 'Claude Code',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    capabilities: { hasStatus: true, hasMcp: true, canResume: true, hasUsage: false },
  },
  codex: {
    kind: 'codex',
    label: 'Codex',
    productName: 'Codex',
    cliName: 'Codex CLI',
    installCommand: 'npm install -g @openai/codex',
    capabilities: { hasStatus: true, hasMcp: true, canResume: true, hasUsage: false },
  },
  opencode: {
    kind: 'opencode',
    label: 'OpenCode',
    productName: 'OpenCode',
    cliName: 'OpenCode',
    installCommand: 'npm install -g opencode-ai',
    capabilities: { hasStatus: true, hasMcp: true, canResume: true, hasUsage: false },
  },
}

/** Every agent, in menu order. */
export const AGENT_LIST: readonly AgentInfo[] = AGENT_KINDS.map((kind) => AGENTS[kind])

/** ⌘T and ⌥⌘T start the default agent (settings); other agents are in the menus. */
export const NEW_AGENT_SHORTCUT = { accelerator: 'CmdOrCtrl+T', symbols: '⌘T' } as const
export const NEW_WORKTREE_AGENT_SHORTCUT = {
  accelerator: 'Alt+CmdOrCtrl+T',
  symbols: '⌥⌘T',
} as const

export const AGENT_LABEL: Readonly<Record<AgentKind, string>> = Object.fromEntries(
  AGENT_LIST.map((agent) => [agent.kind, agent.label]),
) as Record<AgentKind, string>
