import { timingSafeEqual } from 'node:crypto'
import { chmod, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { HOOK_SIGNALS, type HookSignal } from '@shared/agentStatus'

export interface HookServerDeps {
  readonly socketPath: string
  readonly token: string
  readonly onSignal: (terminalId: string, signal: HookSignal) => void
}

const ROUTE = /^\/hooks\/([\w-]{1,64})\/([a-z-]{1,32})$/
const SOCKET_MODE = 0o600

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
    req.resume()
    if (!this.isAuthorized(req.headers.authorization)) return respond(res, 401)

    const match = req.method === 'POST' ? ROUTE.exec(req.url ?? '') : null
    const [, terminalId, signal] = match ?? []
    if (!terminalId || !signal || !isHookSignal(signal)) return respond(res, 404)

    this.deps.onSignal(terminalId, signal)
    respond(res, 204)
  }

  private isAuthorized(header: string | undefined): boolean {
    if (!header) return false
    const actual = Buffer.from(header)
    return actual.length === this.expectedAuth.length && timingSafeEqual(actual, this.expectedAuth)
  }
}

function respond(res: ServerResponse, status: number): void {
  res.writeHead(status).end()
}
