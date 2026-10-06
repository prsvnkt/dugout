/**
 * Entry point of the "dugout" MCP server that Claude Code starts for each Dugout terminal
 * (`claude --mcp-config`). Runs under Electron in Node mode, talks MCP over stdio, and forwards
 * tool calls to Dugout over its private socket.
 */
import { request } from 'node:http'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createTaskServer, type TaskRpc } from './taskTools'

const RPC_TIMEOUT_MS = 30_000

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; this server only runs inside Dugout.`)
  return value
}

const socketPath = requireEnv('DUGOUT_HOOK_SOCKET')
const token = requireEnv('DUGOUT_HOOK_TOKEN')
const terminalId = requireEnv('DUGOUT_TERMINAL_ID')

const rpc: TaskRpc = (method, params) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path: `/rpc/${encodeURIComponent(terminalId)}`,
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        timeout: RPC_TIMEOUT_MS,
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => (body += chunk))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { result?: unknown; error?: string }
            if (res.statusCode === 200) resolve(parsed.result)
            else reject(new Error(parsed.error ?? `Dugout returned HTTP ${res.statusCode}`))
          } catch {
            reject(new Error('Dugout returned an unreadable response.'))
          }
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('Dugout did not respond in time.')))
    req.on('error', (error) => reject(new Error(`Cannot reach Dugout: ${error.message}`)))
    req.end(JSON.stringify({ method, params }))
  })

await createTaskServer(rpc).connect(new StdioServerTransport())
