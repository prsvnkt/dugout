import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  MAX_RELATED_TASKS,
  MAX_TASK_BATCH,
  MAX_TASK_BODY_LENGTH,
  MAX_TASK_LABEL_LENGTH,
  MAX_TASK_LABELS,
  MAX_TASK_SEARCH_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@shared/tasks'

/** Calls Dugout's main process; it resolves the project from the terminal the agent runs in. */
export type TaskRpc = (method: string, params: Record<string, unknown>) => Promise<unknown>

// Dugout validates every call again in main; these schemas tell the agent what it may send.
const number = z
  .number()
  .int()
  .positive()
  .describe('The task number, as list_tasks returns it (123 for #123 or for ENG-123)')
const status = z.enum(TASK_STATUSES)
const title = z.string().min(1).max(MAX_TASK_TITLE_LENGTH)
const body = z.string().max(MAX_TASK_BODY_LENGTH)
const labels = z
  .array(z.string().min(1).max(MAX_TASK_LABEL_LENGTH))
  .max(MAX_TASK_LABELS)
  .describe('Label names, e.g. "bug". Missing labels are created.')
const related = z
  .array(number)
  .max(MAX_RELATED_TASKS)
  .describe('Related task numbers, added to the description as "Related: <key>" lines')
const priority = z.enum(TASK_PRIORITIES).describe('The task priority')
const newTask = {
  title,
  body: body.default(''),
  labels: labels.optional(),
  priority: priority.optional(),
  related: related.optional(),
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

async function run(
  rpc: TaskRpc,
  method: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await rpc(method, params)
    return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

const LIST_DESCRIPTION =
  "List this project's tasks (GitHub or Linear issues) as number, key (#12 or ENG-12), title, " +
  'status, priority, labels and updatedAt; use get_task for the description. Covers open and ' +
  'closed tasks, every status ' +
  '(todo, in-progress, in-review, done), unless you filter by status. Highest priority first. ' +
  'Use search to check for an existing task before creating one.'

function registerReadTools(server: McpServer, rpc: TaskRpc): void {
  server.registerTool(
    'list_tasks',
    {
      description: LIST_DESCRIPTION,
      inputSchema: {
        status: status.optional(),
        search: z
          .string()
          .min(1)
          .max(MAX_TASK_SEARCH_LENGTH)
          .optional()
          .describe('Words that must all appear in the title or description (any case)'),
      },
    },
    (args) => run(rpc, 'list', args),
  )
  server.registerTool(
    'get_task',
    { description: 'Read a task with its description and comments.', inputSchema: { number } },
    (args) => run(rpc, 'get', args),
  )
}

function registerWriteTools(server: McpServer, rpc: TaskRpc): void {
  server.registerTool(
    'create_task',
    {
      description:
        'Create a new task, e.g. a follow-up you found while working. Returns its number, key, ' +
        'url and status. To file several at once, use create_tasks.',
      inputSchema: newTask,
    },
    (args) => run(rpc, 'create', args),
  )
  server.registerTool(
    'create_tasks',
    {
      description:
        `Create up to ${MAX_TASK_BATCH} tasks in one call, in order. Returns each one's ` +
        'number, key, url and status. If one fails, the error says which were already created.',
      inputSchema: { tasks: z.array(z.object(newTask)).min(1).max(MAX_TASK_BATCH) },
    },
    (args) => run(rpc, 'createMany', args),
  )
  server.registerTool(
    'update_task',
    {
      description:
        "Change a task's title, description, status (todo, in-progress, in-review, done), " +
        'priority or labels, or add related tasks. Returns its number, key, url and status.',
      inputSchema: {
        number,
        title: title.optional(),
        body: body.optional(),
        status: status.optional(),
        priority: z
          .enum([...TASK_PRIORITIES, 'none'])
          .optional()
          .describe('The task priority; "none" removes it'),
        addLabels: labels.optional(),
        removeLabels: labels.optional(),
        related: related.optional(),
      },
    },
    (args) => run(rpc, 'update', args),
  )
  server.registerTool(
    'comment_on_task',
    {
      description: 'Post a short progress note or question on a task.',
      inputSchema: { number, body: z.string().min(1).max(MAX_TASK_BODY_LENGTH) },
    },
    (args) => run(rpc, 'comment', args),
  )
}

/**
 * The "dugout" MCP server: lets an agent read and update its project's tasks, wherever they
 * live (GitHub Issues or Linear). It never sees a token or API key; every call goes through
 * Dugout.
 */
export function createTaskServer(rpc: TaskRpc): McpServer {
  const server = new McpServer({ name: 'dugout', version: '1.1.0' })
  registerReadTools(server, rpc)
  registerWriteTools(server, rpc)
  return server
}
