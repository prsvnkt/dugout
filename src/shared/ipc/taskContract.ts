import { z } from 'zod'
import { MAX_LINEAR_API_KEY_LENGTH } from '../linear'
import {
  DUGOUT_LABEL_PREFIX,
  MAX_RELATED_TASKS,
  MAX_TASK_BATCH,
  MAX_TASK_BODY_LENGTH,
  MAX_TASK_LABEL_LENGTH,
  MAX_TASK_LABELS,
  MAX_TASK_SEARCH_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '../tasks'
import { AGENT_KINDS } from '../terminal'
import { projectId } from './fields'

/** Schemas for tasks: the Tasks view's IPC, the agents' task tools, and connecting Linear. */

const taskNumber = z.number().int().positive()
const taskTitle = z.string().trim().min(1).max(MAX_TASK_TITLE_LENGTH)
const taskBody = z.string().max(MAX_TASK_BODY_LENGTH)
const taskStatus = z.enum(TASK_STATUSES)
const taskPriority = z.enum(TASK_PRIORITIES)
/** Dugout's own `dugout:*` labels are set through `status` and `priority` only. */
const taskLabels = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(MAX_TASK_LABEL_LENGTH)
      .refine((label) => !label.startsWith(DUGOUT_LABEL_PREFIX), {
        message: 'Labels starting with "dugout:" are set with status and priority',
      }),
  )
  .max(MAX_TASK_LABELS)
const relatedTasks = z.array(taskNumber).max(MAX_RELATED_TASKS)
const taskInput = z.object({
  title: taskTitle,
  body: taskBody.default(''),
  labels: taskLabels.optional(),
  priority: taskPriority.optional(),
  related: relatedTasks.optional(),
})

/** Task tool arguments sent by an agent's MCP server (the project comes from its terminal). */
export const taskRpcSchemas = {
  list: z.object({
    status: taskStatus.optional(),
    search: z.string().trim().min(1).max(MAX_TASK_SEARCH_LENGTH).optional(),
  }),
  get: z.object({ number: taskNumber }),
  create: taskInput,
  createMany: z.object({ tasks: z.array(taskInput).min(1).max(MAX_TASK_BATCH) }),
  update: z.object({
    number: taskNumber,
    title: taskTitle.optional(),
    body: taskBody.optional(),
    status: taskStatus.optional(),
    // "none" removes the priority.
    priority: z
      .enum([...TASK_PRIORITIES, 'none'])
      .transform((priority) => (priority === 'none' ? null : priority))
      .optional(),
    addLabels: taskLabels.optional(),
    removeLabels: taskLabels.optional(),
    related: relatedTasks.optional(),
  }),
  comment: z.object({
    number: taskNumber,
    body: z.string().trim().min(1).max(MAX_TASK_BODY_LENGTH),
  }),
} as const

export const taskListRequestSchema = z.object({ projectId })
export const taskNumberRequestSchema = z.object({ projectId, number: taskNumber })
export const taskStartSessionRequestSchema = taskNumberRequestSchema.extend({
  agents: z.array(z.enum(AGENT_KINDS)).min(1).max(AGENT_KINDS.length),
})
export const taskCreateRequestSchema = taskRpcSchemas.create.extend({ projectId })
export const taskUpdateRequestSchema = taskRpcSchemas.update.extend({ projectId })
export const taskCommentRequestSchema = taskRpcSchemas.comment.extend({ projectId })

export type TaskCreateRequest = z.input<typeof taskCreateRequestSchema>
export type TaskUpdateRequest = z.input<typeof taskUpdateRequestSchema>

export const linearConnectRequestSchema = z.object({
  apiKey: z.string().trim().min(1).max(MAX_LINEAR_API_KEY_LENGTH),
})
