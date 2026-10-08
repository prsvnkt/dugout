import { HOOK_BINDINGS, signalCommand, type AnySignal } from './hookSettings'

/** The Codex events Dugout listens to; same names and meaning as Claude Code's. */
const CODEX_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
  'SubagentStart',
  'SubagentStop',
] as const

export interface McpServerEntry {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

export type TomlValue =
  string | number | boolean | readonly TomlValue[] | { readonly [key: string]: TomlValue }

const BARE_KEY = /^[A-Za-z0-9_-]+$/

/** Inline TOML for a value (JSON string escapes are valid TOML basic strings). */
export function tomlInline(value: TomlValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value))
    return `[${value.map((item) => tomlInline(item as TomlValue)).join(', ')}]`
  const entries = Object.entries(value as Record<string, TomlValue>).map(
    ([key, item]) => `${BARE_KEY.test(key) ? key : JSON.stringify(key)} = ${tomlInline(item)}`,
  )
  return `{ ${entries.join(', ')} }`
}

function signalFor(event: string): AnySignal | undefined {
  return HOOK_BINDINGS.find((binding) => binding.event === event)?.signal
}

/**
 * `-c key=value` overrides that give a Codex session Dugout's status hooks and the "dugout" task
 * MCP server. Codex collects hooks per config layer, so these fill the session-flags layer and the
 * user's own hooks (config.toml, plugins) keep running alongside them. The commands read the
 * terminal from the environment, so they never change and Codex asks to trust them only once.
 */
export function codexConfigOverrides(mcp: McpServerEntry): string[] {
  const hookOverrides = CODEX_EVENTS.flatMap((event) => {
    const signal = signalFor(event)
    if (!signal) return []
    const group = {
      matcher: '',
      hooks: [{ type: 'command', command: signalCommand(signal), async: true }],
    }
    return [`hooks.${event}=${tomlInline([group])}`]
  })
  const server = { command: mcp.command, args: mcp.args, env: mcp.env }
  return [...hookOverrides, `mcp_servers.dugout=${tomlInline(server)}`]
}
