/** One MCP server from a project's `.mcp.json`, in the fields Dugout edits. */
export type McpServer = StdioMcpServer | RemoteMcpServer

export interface StdioMcpServer {
  readonly name: string
  readonly type: 'stdio'
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

export interface RemoteMcpServer {
  readonly name: string
  readonly type: 'http' | 'sse'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

export const MCP_SERVER_TYPES = ['stdio', 'http', 'sse'] as const

/** Names Codex can use as a TOML key; Dugout's own task server keeps its name. */
export const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/
export const RESERVED_MCP_SERVER = 'dugout'

/** Whether Codex panes get the server too, and if not, why. */
export type CodexSharing =
  { readonly isShared: true } | { readonly isShared: false; readonly reason: string }

/** Which instruction file Claude reads, and whether it imports the shared AGENTS.md. */
export interface InstructionsStatus {
  readonly hasAgentsMd: boolean
  /** `CLAUDE.md` or `.claude/CLAUDE.md`, whichever exists (root first); null when neither does. */
  readonly claudeMdPath: string | null
  readonly importsAgentsMd: boolean
}

export interface AgentConfig {
  /** Servers in `.mcp.json`, or an error when the file cannot be read. */
  readonly mcp:
    | {
        readonly ok: true
        readonly servers: readonly McpServer[]
        readonly codex: Readonly<Record<string, CodexSharing>>
        /** Identifies the file contents read, so a save never overwrites newer changes. */
        readonly version: string
      }
    | { readonly ok: false; readonly error: string }
  readonly instructions: InstructionsStatus
  /** Whether Codex agents can use each preset (`MCP_PRESETS`), keyed by its server name. */
  readonly presetCodex: Readonly<Record<string, CodexSharing>>
}

const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|auth/i
const VARIABLE_REFERENCE = /\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}/

/**
 * Env vars and headers that look like secrets written out in full. `.mcp.json` is usually
 * committed, so these should be `${VAR}` references instead.
 */
export function literalSecrets(server: McpServer): string[] {
  const entries = Object.entries(server.type === 'stdio' ? server.env : server.headers)
  return entries
    .filter(
      ([key, value]) =>
        SECRET_KEY.test(key) && value.trim() !== '' && !VARIABLE_REFERENCE.test(value),
    )
    .map(([key]) => key)
}
