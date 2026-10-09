import { timingSafeEqual } from 'node:crypto'
import { chmod, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  HOOK_SIGNALS,
  SUBAGENT_SIGNALS,
  type HookSignal,
  type SubagentSignal,
  type SubagentUpdate,
} from '@shared/agentStatus'
import { sessionIdSchema } from '@shared/ipc/contract'
import type { ToolCallPreview } from '@shared/toolCall'
import { toolCallPreview, toolCallRef, type ToolCallRef, type ToolPayload } from './toolCall'

/** Details a hook payload may carry along with its signal. */
export interface HookDetails {
  readonly sessionId?: string
  /** Why the agent is waiting, or what it just finished; short, for the inbox. */
  readonly detail?: string
  /** The tool call a permission request is about, or that finished. */
  readonly toolCall?: ToolCallRef
  /** The whole tool call waiting for approval (permission requests only). */
  readonly preview?: ToolCallPreview
  /** The session transcript the agent writes, where its token usage is (`transcript_path`). */
  readonly transcriptPath?: string
}

const MAX_DETAIL_LENGTH = 140

interface HookPayload extends ToolPayload {
  session_id?: unknown
  hook_event_name?: unknown
  message?: unknown
  last_assistant_message?: unknown
  agent_id?: unknown
  agent_type?: unknown
  transcript_path?: unknown
  agent_transcript_path?: unknown
}

/** Transcript paths are absolute file paths; anything else is ignored. */
const MAX_PATH_LENGTH = 4096

function pathOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && value.length <= MAX_PATH_LENGTH
    ? value
    : undefined
}

/** Subagent ids from Claude Code and Codex are short tokens; anything else is ignored. */
const SUBAGENT_ID = /^[\w-]{1,128}$/
const MAX_SUBAGENT_TYPE_LENGTH = 64
const UNNAMED_SUBAGENT = 'subagent'

function shorten(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > MAX_DETAIL_LENGTH ? `${line.slice(0, MAX_DETAIL_LENGTH - 1)}…` : line
}

/** "Bash: npm install", "Edit: src/a.ts", a notification message, or the last reply's first line. */
function detailOf(payload: HookPayload): string | undefined {
  const asText = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)
  switch (payload.hook_event_name) {
    case 'PermissionRequest': {
      const tool = asText(payload.tool_name)
      const input = payload.tool_input as {
        command?: unknown
        file_path?: unknown
        url?: unknown
      } | null
      const target = asText(input?.command) ?? asText(input?.file_path) ?? asText(input?.url)
      return tool ? shorten(target ? `${tool}: ${target}` : tool) : undefined
    }
    case 'Notification': {
      const message = asText(payload.message)
      return message && shorten(message)
    }
    case 'Stop': {
      const message = asText(payload.last_assistant_message)
      return message && shorten(message)
    }
    default:
      return undefined
  }
}

export interface HookServerDeps {
  readonly socketPath: string
  readonly token: string
  readonly onSignal: (terminalId: string, signal: HookSignal, details: HookDetails) => void
  /** Task tool calls from the terminal's MCP server; resolves to the JSON result. */
  readonly onRpc: (terminalId: string, method: string, params: unknown) => Promise<unknown>
  /**
   * A subagent of the terminal's agent started or stopped; `transcriptPath` is the subagent's own
   * transcript, when its stop names one.
   */
  readonly onSubagent: (
    terminalId: string,
    update: SubagentUpdate,
    transcriptPath: string | undefined,
  ) => void
}

const ROUTE = /^\/hooks\/([\w-]{1,64})\/([a-z-]{1,32})$/
const RPC_ROUTE = /^\/rpc\/([\w-]{1,64})$/
const SOCKET_MODE = 0o600
/** Task calls and subagent payloads are small JSON objects; anything bigger is not ours. */
const MAX_BODY_BYTES = 64 * 1024
/** Status payloads can be large: PostToolUse includes the tool's whole output. */
const MAX_HOOK_BODY_BYTES = 4 * 1024 * 1024

function isHookSignal(value: string): value is HookSignal {
  return (HOOK_SIGNALS as readonly string[]).includes(value)
}

function isSubagentSignal(value: string): value is SubagentSignal {
  return (SUBAGENT_SIGNALS as readonly string[]).includes(value)
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
    if (terminalId && signal && isSubagentSignal(signal)) {
      return readBody(req, MAX_BODY_BYTES, (body) => {
        if (body === null) return respond(res, 413)
        const update = parseSubagent(signal, body)
        if (update) this.deps.onSubagent(terminalId, update, subagentTranscriptOf(body))
        respond(res, 204)
      })
    }
    if (!terminalId || !signal || !isHookSignal(signal)) {
      req.resume()
      return respond(res, 404)
    }
    readBody(req, MAX_HOOK_BODY_BYTES, (body) => {
      if (body === null) return respond(res, 413)
      this.deps.onSignal(terminalId, signal, parseDetails(body))
      respond(res, 204)
    })
  }

  private handleRpc(terminalId: string, req: IncomingMessage, res: ServerResponse): void {
    readBody(req, MAX_BODY_BYTES, (body) => {
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

/** Events about one tool call: the request to approve it, and it finishing either way. */
const TOOL_EVENTS: ReadonlySet<unknown> = new Set([
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
])

function toolDetails(payload: HookPayload): Pick<HookDetails, 'toolCall' | 'preview'> {
  if (!TOOL_EVENTS.has(payload.hook_event_name)) return {}
  const toolCall = toolCallRef(payload)
  if (!toolCall) return {}
  const preview = payload.hook_event_name === 'PermissionRequest' ? toolCallPreview(payload) : null
  return { toolCall, ...(preview && { preview }) }
}

function parseDetails(body: string): HookDetails {
  if (!body) return {}
  try {
    const payload = (JSON.parse(body) ?? {}) as HookPayload
    const sessionId = sessionIdSchema.safeParse(payload.session_id)
    const detail = detailOf(payload)
    const transcriptPath = pathOf(payload.transcript_path)
    return {
      ...(sessionId.success && { sessionId: sessionId.data }),
      ...(detail && { detail }),
      ...(transcriptPath && { transcriptPath }),
      ...toolDetails(payload),
    }
  } catch {
    return {}
  }
}

/** Which subagent started or stopped; null when the payload names none we can trust. */
function parseSubagent(signal: SubagentSignal, body: string): SubagentUpdate | null {
  let payload: HookPayload
  try {
    payload = (JSON.parse(body) ?? {}) as HookPayload
  } catch {
    return null
  }
  const id = payload.agent_id
  if (typeof id !== 'string' || !SUBAGENT_ID.test(id)) return null
  const rawType = typeof payload.agent_type === 'string' ? payload.agent_type.trim() : ''
  const type = rawType.slice(0, MAX_SUBAGENT_TYPE_LENGTH) || UNNAMED_SUBAGENT
  if (signal === 'subagent-start') return { id, type, state: 'running' }
  const message = payload.last_assistant_message
  const detail = typeof message === 'string' && message.trim() ? shorten(message) : undefined
  return { id, type, state: 'done', ...(detail && { detail }) }
}

function subagentTranscriptOf(body: string): string | undefined {
  try {
    return pathOf(((JSON.parse(body) ?? {}) as HookPayload).agent_transcript_path)
  } catch {
    return undefined
  }
}

/** Reads a request body up to `maxBytes`; null when it is larger. */
function readBody(
  req: IncomingMessage,
  maxBytes: number,
  done: (body: string | null) => void,
): void {
  const chunks: Buffer[] = []
  let size = 0
  let isTooLarge = false
  req.on('data', (chunk: Buffer) => {
    size += chunk.length
    if (size > maxBytes) isTooLarge = true
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
