import {
  MCP_SERVER_NAME,
  RESERVED_MCP_SERVER,
  type CodexSharing,
  type McpServer,
  type RemoteMcpServer,
  type StdioMcpServer,
} from '@shared/agentConfig'
import type { TomlValue } from './codexConfig'

export type CodexMcpResult =
  | { readonly ok: true; readonly config: { readonly [key: string]: TomlValue } }
  | { readonly ok: false; readonly reason: string }

const WHOLE_VARIABLE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/
const BEARER_VARIABLE = /^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/
const ANY_VARIABLE = /\$\{/

const skip = (reason: string): CodexMcpResult => ({ ok: false, reason })

function stdioConfig(server: StdioMcpServer): CodexMcpResult {
  if ([server.command, ...server.args].some((part) => ANY_VARIABLE.test(part))) {
    return skip('Codex cannot expand ${VAR} in the command or its arguments.')
  }
  const env: Record<string, string> = {}
  const forwarded: string[] = []
  for (const [key, value] of Object.entries(server.env)) {
    const variable = WHOLE_VARIABLE.exec(value)?.[1]
    if (variable === key) forwarded.push(key)
    else if (variable !== undefined || ANY_VARIABLE.test(value)) {
      return skip(`Codex can only pass ${key} through as \${${key}}.`)
    } else env[key] = value
  }
  return {
    ok: true,
    config: {
      command: server.command,
      ...(server.args.length > 0 && { args: server.args }),
      ...(Object.keys(env).length > 0 && { env }),
      ...(forwarded.length > 0 && { env_vars: forwarded }),
    },
  }
}

function httpConfig(server: RemoteMcpServer): CodexMcpResult {
  if (ANY_VARIABLE.test(server.url)) return skip('Codex cannot expand ${VAR} in the URL.')
  let bearer: string | undefined
  const literal: Record<string, string> = {}
  const fromEnv: Record<string, string> = {}
  for (const [name, value] of Object.entries(server.headers)) {
    const bearerVariable =
      name.toLowerCase() === 'authorization' ? BEARER_VARIABLE.exec(value)?.[1] : undefined
    const variable = WHOLE_VARIABLE.exec(value)?.[1]
    if (bearerVariable) bearer = bearerVariable
    else if (variable) fromEnv[name] = variable
    else if (ANY_VARIABLE.test(value))
      return skip(`Codex cannot expand \${VAR} inside the ${name} header.`)
    else literal[name] = value
  }
  return {
    ok: true,
    config: {
      url: server.url,
      ...(bearer && { bearer_token_env_var: bearer }),
      ...(Object.keys(literal).length > 0 && { http_headers: literal }),
      ...(Object.keys(fromEnv).length > 0 && { env_http_headers: fromEnv }),
    },
  }
}

/** The project's `.mcp.json` server as Codex config, or why Codex cannot use it. */
export function codexMcpServer(server: McpServer): CodexMcpResult {
  if (server.name === RESERVED_MCP_SERVER)
    return skip('"dugout" is reserved for Dugout\'s task tools.')
  if (!MCP_SERVER_NAME.test(server.name)) {
    return skip('Codex needs a name of letters, digits, - and _ only.')
  }
  if (server.type === 'sse') return skip('Codex does not support SSE servers.')
  return server.type === 'stdio' ? stdioConfig(server) : httpConfig(server)
}

export function codexSharing(server: McpServer): CodexSharing {
  const result = codexMcpServer(server)
  return result.ok ? { isShared: true } : { isShared: false, reason: result.reason }
}
