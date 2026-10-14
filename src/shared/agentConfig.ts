import type { AgentKind } from './agents'

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

/** Names every agent can use (Codex needs a TOML key); Dugout's own task server keeps its name. */
export const MCP_SERVER_NAME = /^[A-Za-z0-9_-]{1,64}$/
export const RESERVED_MCP_SERVER = 'dugout'

/** Whether an agent gets a server, and if not, why. */
export type McpSharing =
  { readonly isShared: true } | { readonly isShared: false; readonly reason: string }

/**
 * Whether each agent that takes `.mcp.json` servers (`projectMcp` other than `none`) gets one
 * server, keyed by agent kind.
 */
export type AgentSharing = Readonly<Partial<Record<AgentKind, McpSharing>>>

/**
 * `.mcp.json` servers an agent with `needsMcpApproval` did not get when it started, because the
 * project's servers were not approved, or changed since (decision 057).
 */
export interface WithheldServers {
  /** The servers it would have got. */
  readonly servers: readonly McpServer[]
  /** Identifies every server in the file; approving stores it. */
  readonly hash: string
}

/** Whether the project's current `.mcp.json` servers are approved (decision 057). */
export interface ServerApproval {
  /** Identifies every server in the file as read; sent back to approve exactly these. */
  readonly hash: string
  readonly isApproved: boolean
}

/** An agent that reads its own instructions file, which should import the shared one. */
export interface OwnInstructions {
  readonly kind: AgentKind
  /** The first of its `instructionsFiles` that exists; null when none does. */
  readonly path: string | null
  /** Whether that file imports `SHARED_INSTRUCTIONS_FILE`. */
  readonly importsShared: boolean
}

/** Whether the shared instructions exist, and whether every agent's own file imports them. */
export interface InstructionsStatus {
  readonly hasSharedFile: boolean
  readonly ownFiles: readonly OwnInstructions[]
}

export interface AgentConfig {
  /** Servers in `.mcp.json`, or an error when the file cannot be read. */
  readonly mcp:
    | {
        readonly ok: true
        readonly servers: readonly McpServer[]
        /** Which agents get each server, keyed by its name. */
        readonly sharing: Readonly<Record<string, AgentSharing>>
        /** Whether agents with `needsMcpApproval` may get the servers (decision 057). */
        readonly approval: ServerApproval
        /** Identifies the file contents read, so a save never overwrites newer changes. */
        readonly version: string
      }
    | { readonly ok: false; readonly error: string }
  readonly instructions: InstructionsStatus
  /** Which agents could use each preset (`MCP_PRESETS`), keyed by its server name. */
  readonly presetSharing: Readonly<Record<string, AgentSharing>>
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
