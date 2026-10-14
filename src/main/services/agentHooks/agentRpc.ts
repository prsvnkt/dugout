import { CONTEXT_RPC_PREFIX, handleContextRpc, type ContextRpcStore } from '../context/contextRpc'
import type { ContextProject } from '../context/ContextStore'
import { handleTaskRpc, type TaskRpcTasks } from '../tasks/taskRpc'
import type { TerminalManager } from '../terminal/TerminalManager'

export const NOT_A_PROJECT = 'This terminal is not part of a Dugout project.'

export interface AgentRpcDeps {
  /** The terminal manager, once built: hooks start before it exists. */
  readonly terminals: () => Pick<TerminalManager, 'projectOf' | 'agentInfo'> | null
  readonly findProject: (projectId: string) => ContextProject | undefined
  readonly tasks: TaskRpcTasks
  readonly context: ContextRpcStore
  /** A context call changed what the Context tab shows (a note now waits for approval). */
  readonly onContextChanged: (projectId: string) => void
}

export type AgentRpcHandler = (
  terminalId: string,
  method: string,
  params: unknown,
) => Promise<unknown>

/** Tool calls from an agent's "dugout" MCP server: scoped to the project of its terminal. */
export function createAgentRpc(deps: AgentRpcDeps): AgentRpcHandler {
  return async (terminalId, method, params) => {
    const terminals = deps.terminals()
    const projectId = terminals?.projectOf(terminalId)
    if (!terminals || !projectId) throw new Error(NOT_A_PROJECT)
    if (!method.startsWith(CONTEXT_RPC_PREFIX)) {
      return handleTaskRpc(deps.tasks, projectId, method, params)
    }
    const project = deps.findProject(projectId)
    if (!project) throw new Error(NOT_A_PROJECT)
    const caller = { project, agent: terminals.agentInfo(terminalId)?.kind ?? null }
    return handleContextRpc(deps.context, caller, method, params, () =>
      deps.onContextChanged(projectId),
    )
  }
}
