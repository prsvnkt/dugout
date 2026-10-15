import { mediaTypeOf, parseFileUrl } from '@shared/viewers'
import type { GitCheckout } from '@shared/worktree'
import type { FileService, OpenedFile } from '../files/FileService'
import { parseRange } from './byteRange'

/**
 * The `dugout-file:` protocol (decision 067): serves media files from a checkout to the
 * editor's viewers, streamed with Range support so videos seek. The URL names a project and a
 * repo-relative path, never a folder; main resolves the checkout and FileService checks the path.
 */
export interface FileProtocolDeps {
  /** The checkout's root; throws for an unknown project or a worktree not of that project. */
  resolveRoot(checkout: GitCheckout): Promise<string>
  readonly files: Pick<FileService, 'openRead'>
  /** Logs why a request was refused (never file content). */
  warn(message: string): void
}

/**
 * Sent with every response. The scheme is only reachable from Dugout's own window (navigation
 * and new windows are blocked), so any origin may read it; that lets pdf.js `fetch` ranges
 * from the renderer's file:// (or dev server) origin. The CSP sandbox means a file opened as
 * a document (an SVG) could never run script.
 */
const COMMON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
} as const

const PREFLIGHT_HEADERS = {
  ...COMMON_HEADERS,
  'Access-Control-Allow-Methods': 'GET, HEAD',
  'Access-Control-Allow-Headers': 'Range',
} as const

function refuse(status: number): Response {
  return new Response(null, { status, headers: COMMON_HEADERS })
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createFileProtocolHandler(
  deps: FileProtocolDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { headers: PREFLIGHT_HEADERS })
    if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405)
    const target = parseFileUrl(request.url)
    if (!target) return refuse(400)
    const type = mediaTypeOf(target.path)
    // Only files a viewer shows; source, .env and the like stay behind the files IPC.
    if (!type) return refuse(415)
    try {
      const root = await deps.resolveRoot(target.checkout)
      const file = await deps.files.openRead(root, target.path)
      return await respond(request, file, type.mime)
    } catch (error) {
      if (isMissing(error)) return refuse(404)
      deps.warn(`[dugout-file] refused ${target.path}: ${messageOf(error)}`)
      return refuse(403)
    }
  }
}

async function respond(request: Request, file: OpenedFile, mime: string): Promise<Response> {
  const range = parseRange(request.headers.get('range'), file.size)
  const headers = { ...COMMON_HEADERS, 'Accept-Ranges': 'bytes', 'Content-Type': mime }
  if (range.kind === 'unsatisfiable') {
    await file.close()
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${file.size}` },
    })
  }
  const isPartial = range.kind === 'partial'
  const length = isPartial ? range.end - range.start + 1 : file.size
  const rangeHeaders = isPartial
    ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.size}` }
    : {}
  const init = {
    status: isPartial ? 206 : 200,
    headers: { ...headers, ...rangeHeaders, 'Content-Length': String(length) },
  }
  if (request.method === 'HEAD') {
    await file.close()
    return new Response(null, init)
  }
  return new Response(file.stream(isPartial ? range : undefined), init)
}
