import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { fail, ok, type Result } from '@shared/result'
import { parsePayload } from './validate'

/** The part of Electron's `ipcMain` the handlers use; unit tests pass a fake. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, payload: unknown) => unknown): void
  on(channel: string, listener: (event: IpcMainEvent, payload: unknown) => void): unknown
}

/**
 * Only the window's own page may call main: a subframe (none exist today, the CSP and navigation
 * rules keep it so) is refused. Test events without a frame count as the main frame.
 */
function isFromSubframe(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame as { parent: unknown } | null | undefined
  return frame != null && frame.parent != null
}

/**
 * Registers a request-response handler that validates its payload and always resolves
 * to a `Result`, so the renderer gets a readable error instead of a rejected promise.
 */
export function handleRequest<Request, Response>(
  channel: string,
  schema: z.ZodType<Request>,
  handler: (request: Request, event: IpcMainInvokeEvent) => Promise<Response> | Response,
  ipc: IpcMainLike = ipcMain,
): void {
  ipc.handle(channel, async (event, payload: unknown): Promise<Result<Response>> => {
    if (isFromSubframe(event)) {
      console.warn(`[ipc] rejected "${channel}" from a subframe`)
      return fail('Invalid request.')
    }
    const request = parsePayload(schema, payload, channel)
    if (request === null) return fail('Invalid request.')
    try {
      return ok(await handler(request, event))
    } catch (error) {
      console.error(`[ipc] "${channel}" failed:`, error)
      return fail(error instanceof Error ? error.message : 'Something went wrong.')
    }
  })
}
