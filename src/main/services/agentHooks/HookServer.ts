import { timingSafeEqual } from 'node:crypto'
import { chmod, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { HOOK_SIGNALS, type HookSignal } from '@shared/agentStatus'
import { sessionIdSchema } from '@shared/ipc/contract'

/** Details a hook payload may carry along with its signal. */
export interface HookDetails {
  readonly sessionId?: string
}

export interface HookServerDeps {
  readonly socketPath: string
  readonly token: string
  readonly onSignal: (terminalId: string, signal: HookSignal, details: HookDetails) => void
  /** Task tool calls from the terminal's MCP server; resolves to the JSON result. */
  readonly onRpc: (terminalId: string, method: string, params: unknown) => Promise<unknown>
}

const ROUTE = /^\/hooks\/([\w-]{1,64})\/([a-z-]{1,32})$/
const RPC_ROUTE = /^\/rpc\/([\w-]{1,64})$/
const SOCKET_MODE = 0o600
/** Hook payloads are small JSON objects; anything bigger is not from our hooks. */
const MAX_BODY_BYTES = 64 * 1024

function isHookSignal(value: string): value is HookSignal {
  return (HOOK_SIGNALS as readonly string[]).includes(value)
}

/**
 * Receives status signals from Claude Code hooks over a Unix socket that only the current
 * user can open. Requests also carry a per-launch bearer token.
 */
export class HookServer {
  private readonly server: Server
  private readonly expectedAuth: Buffer

  constructor(private readonly deps: HookServerDeps) {
    this.expectedAuth = Buffer.from(`Bearer ${deps.token}`)
    this.server = createServer((req, res) => this.handle(req, res))
  }

  async listen(): Promise<void> {
    await rm(this.deps.socketPath, { force: true })
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.deps.socketPath, () => resolve())
    })
    await chmod(this.deps.socketPath, SOCKET_MODE)
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
    await rm(this.deps.socketPath, { force: true })
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (!this.isAuthorized(req.headers.authorization)) {
      req.resume()
      return respond(res, 401)
    }
    const rpcMatch = req.method === 'POST' ? RPC_ROUTE.exec(req.url ?? '') : null
    if (rpcMatch?.[1]) return this.handleRpc(rpcMatch[1], req, res)
    const match = req.method === 'POST' ? ROUTE.exec(req.url ?? '') : null
    const [, terminalId, signal] = match ?? []
    if (!terminalId || !signal || !isHookSignal(signal)) {
      req.resume()
      return respond(res, 404)
    }

    const chunks: Buffer[] = []
    let size = 0
    let isTooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) isTooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (isTooLarge) return respond(res, 413)
      this.deps.onSignal(terminalId, signal, parseDetails(Buffer.concat(chunks).toString('utf8')))
      respond(res, 204)
    })
  }

  private handleRpc(terminalId: string, req: IncomingMessage, res: ServerResponse): void {
    readBody(req, (body) => {
      if (body === null) return respond(res, 413)
      let call: { method?: unknown; params?: unknown }
      try {
        call = JSON.parse(body) as { method?: unknown; params?: unknown }
      } catch {
        return respondJson(res, 400, { error: 'Malformed request.' })
      }
      if (typeof call.method !== 'string')
        return respondJson(res, 400, { error: 'Missing method.' })
      this.deps
        .onRpc(terminalId, call.method, call.params ?? {})
        .then((result) => respondJson(res, 200, { result: result ?? null }))
        .catch((error: unknown) =>
          respondJson(res, 400, { error: error instanceof Error ? error.message : 'Failed.' }),
        )
    })
  }

  private isAuthorized(header: string | undefined): boolean {
    if (!header) return false
    const actual = Buffer.from(header)
    return actual.length === this.expectedAuth.length && timingSafeEqual(actual, this.expectedAuth)
  }
}

function parseDetails(body: string): HookDetails {
  if (!body) return {}
  try {
    const payload: unknown = JSON.parse(body)
    const id = (payload as { session_id?: unknown } | null)?.session_id
    const parsed = sessionIdSchema.safeParse(id)
    return parsed.success ? { sessionId: parsed.data } : {}
  } catch {
    return {}
  }
}

/** Reads a request body up to MAX_BODY_BYTES; null when it is larger. */
function readBody(req: IncomingMessage, done: (body: string | null) => void): void {
  const chunks: Buffer[] = []
  let size = 0
  let isTooLarge = false
  req.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > MAX_BODY_BYTES) isTooLarge = true
    else chunks.push(chunk)
  })
  req.on('end', () => done(isTooLarge ? null : Buffer.concat(chunks).toString('utf8')))
}

function respondJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function respond(res: ServerResponse, status: number): void {
  res.writeHead(status).end()
}
