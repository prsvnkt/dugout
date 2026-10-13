import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServer } from '@shared/agentConfig'
import { MCP_JSON, parseMcpJson } from './mcpJson'

type Canonical = string | readonly Canonical[] | { readonly [key: string]: Canonical }

const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The value with every object's keys sorted; arrays keep their order (arguments are ordered). */
function canonical(value: unknown): Canonical {
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => byKey(a, b))
    return Object.fromEntries(entries.map(([key, item]) => [key, canonical(item)]))
  }
  return String(value)
}

/**
 * Identifies a set of `.mcp.json` servers, whatever order they and their keys are in, for the
 * per-project approval of servers Dugout passes to agents itself (decision 057).
 */
export function serversHash(servers: readonly McpServer[]): string {
  const sorted = [...servers].sort((a, b) => byKey(a.name, b.name))
  return createHash('sha256')
    .update(JSON.stringify(canonical(sorted)))
    .digest('hex')
}

export interface ProjectServers {
  readonly servers: readonly McpServer[]
  readonly hash: string
}

/** The servers in `<cwd>/.mcp.json` and their hash; null when there is no readable file. */
export function readProjectServers(cwd: string): ProjectServers | null {
  try {
    const { servers } = parseMcpJson(readFileSync(join(cwd, MCP_JSON), 'utf8'))
    return { servers, hash: serversHash(servers) }
  } catch {
    return null
  }
}
