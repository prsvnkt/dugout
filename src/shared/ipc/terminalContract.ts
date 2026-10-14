import { z } from 'zod'
import { MAX_DEV_PORT, MIN_DEV_PORT } from '../preview'
import { TERMINAL_KINDS } from '../terminal'
import { absolutePath, projectId, sessionId } from './fields'

/** Schemas for terminal IPC: starting agents and shells, input, resizing and flow control. */

const MAX_TERMINAL_DIMENSION = 1000
const MAX_WRITE_BYTES = 1024 * 1024

/** First message for a new agent session, e.g. from the start screen's prompt box. */
export const MAX_INITIAL_PROMPT_LENGTH = 10_000

const dimension = z.number().int().min(1).max(MAX_TERMINAL_DIMENSION)
const terminalId = z.string().min(1).max(64)

export const terminalCreateRequestSchema = z.object({
  kind: z.enum(TERMINAL_KINDS),
  projectId,
  /** Continue this agent conversation (agents that canResume) instead of starting a new one. */
  resumeSessionId: sessionId.optional(),
  /** First message for a new agent session (e.g. the task it was started for). */
  initialPrompt: z.string().min(1).max(MAX_INITIAL_PROMPT_LENGTH).optional(),
  /** The task an agent was started for; its token usage counts towards the task. */
  taskNumber: z.number().int().positive().optional(),
  /** `PORT` for a dev server started in this shell. */
  port: z.number().int().min(MIN_DEV_PORT).max(MAX_DEV_PORT).optional(),
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
export const terminalWithheldServersRequestSchema = z.object({ id: terminalId })

/** Output flow control: pause or resume reading a terminal's PTY (decision 056). */
export const terminalFlowRequestSchema = z.object({ id: terminalId })

export type TerminalCreateRequest = z.infer<typeof terminalCreateRequestSchema>
