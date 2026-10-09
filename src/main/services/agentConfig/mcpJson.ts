import { z } from 'zod'
import type { McpServer } from '@shared/agentConfig'

const stringRecord = z.record(z.string(), z.string())

/** Only the fields Dugout edits are checked; anything else on a server is kept as is. */
const stdioSchema = z.looseObject({
  type: z.literal('stdio').optional(),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: stringRecord.optional(),
})
const remoteSchema = z.looseObject({
  type: z.enum(['http', 'sse']),
  url: z.string().min(1),
  headers: stringRecord.optional(),
})

const fileSchema = z.looseObject({ mcpServers: z.record(z.string(), z.unknown()).optional() })

/** The project's MCP servers file, at the checkout root (shared with Claude Code). */
export const MCP_JSON = '.mcp.json'

export type McpJsonRaw = z.infer<typeof fileSchema>

/** Fields Dugout writes; on save they are replaced, everything else on a server is kept. */
const EDITED_KEYS = ['type', 'command', 'args', 'env', 'url', 'headers'] as const
const INDENT = 2

function toServer(name: string, value: unknown): McpServer {
  const stdio = stdioSchema.safeParse(value)
  if (stdio.success) {
    const { command, args, env } = stdio.data
    return { name, type: 'stdio', command, args: args ?? [], env: env ?? {} }
  }
  const remote = remoteSchema.safeParse(value)
  if (remote.success) {
    const { type, url, headers } = remote.data
    return { name, type, url, headers: headers ?? {} }
  }
  throw new Error(`Server "${name}" in .mcp.json needs a command, or a type and url.`)
}

/** Reads `.mcp.json` text (null when the file does not exist). */
export function parseMcpJson(text: string | null): {
  raw: McpJsonRaw | null
  servers: McpServer[]
} {
  if (text === null) return { raw: null, servers: [] }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('.mcp.json is not valid JSON.')
  }
  const parsed = fileSchema.safeParse(json)
  if (!parsed.success) throw new Error('.mcp.json should be an object with "mcpServers".')
  const servers = Object.entries(parsed.data.mcpServers ?? {}).map(([name, value]) =>
    toServer(name, value),
  )
  return { raw: parsed.data, servers }
}

function withoutEditedKeys(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !(EDITED_KEYS as readonly string[]).includes(key)),
  )
}

function serverJson(server: McpServer, previous: unknown): Record<string, unknown> {
  const kept = withoutEditedKeys(previous)
  const hadType = typeof previous === 'object' && previous !== null && 'type' in previous
  if (server.type === 'stdio') {
    return {
      ...kept,
      ...(hadType && { type: 'stdio' }),
      command: server.command,
      ...(server.args.length > 0 && { args: server.args }),
      ...(Object.keys(server.env).length > 0 && { env: server.env }),
    }
  }
  return {
    ...kept,
    type: server.type,
    url: server.url,
    ...(Object.keys(server.headers).length > 0 && { headers: server.headers }),
  }
}

/** The new `.mcp.json` text: the edited servers, with every field Dugout does not edit kept. */
export function serializeMcpJson(raw: McpJsonRaw | null, servers: readonly McpServer[]): string {
  const previous = raw?.mcpServers ?? {}
  const mcpServers = Object.fromEntries(
    servers.map((server) => [server.name, serverJson(server, previous[server.name])]),
  )
  return `${JSON.stringify({ ...raw, mcpServers }, null, INDENT)}\n`
}
