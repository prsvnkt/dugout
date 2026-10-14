import { z } from 'zod'
import { AGENT_KINDS } from '../terminal'
import { projectId, sessionId } from './fields'

/** Schemas for what is read from agent transcripts: token usage and session timelines. */

export const usageProjectRequestSchema = z.object({ projectId })
export const timelineSessionRequestSchema = z.object({ agent: z.enum(AGENT_KINDS), sessionId })
