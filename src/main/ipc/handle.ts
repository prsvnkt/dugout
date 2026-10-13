import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { fail, ok, type Result } from '@shared/result'
import { parsePayload } from './validate'

/** The part of Electron's `ipcMain` the handlers use; unit tests pass a fake. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, payload: unknown) => unknown): void
  on(channel: string, listener: (event: IpcMainEvent) => void): unknown
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
