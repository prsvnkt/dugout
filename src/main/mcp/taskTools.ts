import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TASK_STATUSES } from '@shared/tasks'

/** Calls Dugout's main process; it resolves the project from the terminal the agent runs in. */
export type TaskRpc = (method: string, params: Record<string, unknown>) => Promise<unknown>

const number = z.number().int().positive().describe('The task (GitHub issue) number')
const status = z.enum(TASK_STATUSES)

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

async function run(
  rpc: TaskRpc,
  method: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await rpc(method, params)
    return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }, null, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

/**
 * The "dugout" MCP server: lets an agent read and update its project's tasks (GitHub Issues).
 * It never sees the GitHub token; every call goes through Dugout.
 */
export function createTaskServer(rpc: TaskRpc): McpServer {
  const server = new McpServer({ name: 'dugout', version: '1.0.0' })

  server.registerTool(
    'list_tasks',
    {
      description: "List this project's tasks (GitHub issues), optionally filtered by status.",
      inputSchema: { status: status.optional() },
    },
    (args) => run(rpc, 'list', args),
  )
  server.registerTool(
    'get_task',
    { description: 'Read a task with its description and comments.', inputSchema: { number } },
    (args) => run(rpc, 'get', args),
  )
  server.registerTool(
    'create_task',
    {
      description: 'Create a new task, e.g. a follow-up you found while working.',
      inputSchema: { title: z.string().min(1).max(256), body: z.string().max(65_000).default('') },
    },
    (args) => run(rpc, 'create', args),
  )
  server.registerTool(
    'update_task',
    {
      description:
        "Change a task's title, description or status (todo, in-progress, in-review, done).",
      inputSchema: {
        number,
        title: z.string().min(1).max(256).optional(),
        body: z.string().max(65_000).optional(),
        status: status.optional(),
      },
    },
    (args) => run(rpc, 'update', args),
  )
  server.registerTool(
    'comment_on_task',
    {
      description: 'Post a short progress note or question on a task.',
      inputSchema: { number, body: z.string().min(1).max(65_000) },
    },
    (args) => run(rpc, 'comment', args),
  )
  return server
}
