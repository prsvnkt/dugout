import type { z } from 'zod'

/** Parses an IPC payload, logging and returning null instead of throwing on bad input. */
export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown, channel: string): T | null {
  const result = schema.safeParse(payload)
  if (result.success) return result.data
  console.warn(`[ipc] rejected invalid payload on "${channel}":`, result.error.issues)
  return null
}
