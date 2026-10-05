import { z } from 'zod'
import { TERMINAL_KINDS } from '../terminal'

/** Schemas for IPC payloads. Main validates every incoming payload; never trust the renderer. */

const MAX_TERMINAL_DIMENSION = 1000
const MAX_WRITE_BYTES = 1024 * 1024

const dimension = z.number().int().min(1).max(MAX_TERMINAL_DIMENSION)
const terminalId = z.string().min(1).max(64)
const absolutePath = z
  .string()
  .min(1)
  .refine((path) => path.startsWith('/'), 'Path must be absolute')

export const terminalCreateRequestSchema = z.object({
  kind: z.enum(TERMINAL_KINDS),
  cwd: absolutePath,
  cols: dimension,
  rows: dimension,
})

export const terminalWriteRequestSchema = z.object({
  id: terminalId,
  data: z.string().max(MAX_WRITE_BYTES),
})

export const terminalResizeRequestSchema = z.object({
  id: terminalId,
  cols: dimension,
  rows: dimension,
})

export const terminalKillRequestSchema = z.object({ id: terminalId })

export type TerminalCreateRequest = z.infer<typeof terminalCreateRequestSchema>
export type TerminalWriteRequest = z.infer<typeof terminalWriteRequestSchema>
export type TerminalResizeRequest = z.infer<typeof terminalResizeRequestSchema>
export type TerminalKillRequest = z.infer<typeof terminalKillRequestSchema>
