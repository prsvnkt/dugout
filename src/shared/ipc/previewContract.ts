import { z } from 'zod'
import { DEV_PORT_RANGE, MAX_DEV_PORT, MIN_DEV_PORT } from '../preview'

/** Schemas for the Git panel's Preview block: dev server ports and links it may open. */

/** Ports already given to running dev servers, which a new one must not get. */
export const previewAssignPortRequestSchema = z.object({
  reserved: z
    .array(z.number().int().min(MIN_DEV_PORT).max(MAX_DEV_PORT))
    .max(DEV_PORT_RANGE.last - DEV_PORT_RANGE.first + 1),
})

export const previewOpenUrlRequestSchema = z.object({ url: z.url().max(2048) })
