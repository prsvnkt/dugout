import { z } from 'zod'
import { AGENT_KINDS } from '../terminal'

/** Schema for app preferences. */

export const settingsUpdateRequestSchema = z.object({ defaultAgent: z.enum(AGENT_KINDS) })
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>
