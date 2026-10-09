import type { AgentKind } from '@shared/agents'
import type { ContextEntryView } from '@shared/context'
import { contextRpcSchemas } from '@shared/ipc/contextContract'
import type { ContextProject, ContextStore } from './ContextStore'
import { indexItem, searchContext, type ContextIndexItem } from './contextSearch'

/** Agent RPC methods for project context start with this; the rest are task methods. */
export const CONTEXT_RPC_PREFIX = 'context.'

export type ContextRpcStore = Pick<ContextStore, 'entries' | 'get' | 'propose'>

/** Who is calling: the project and agent of the terminal the MCP server serves. */
export interface ContextCaller {
  readonly project: ContextProject
  readonly agent: AgentKind | null
}

export const CONTEXT_COVERAGE =
  'Approved shared and private entries; notes you add appear once the user approves them.'

/** `get_context`: the entry without its hash, which only Dugout needs. */
function entryForAgent(entry: ContextEntryView) {
  const { body, updatedAt } = entry
  return {
    ...indexItem(entry),
    ...(entry.kind === 'doc' && { source: entry.source }),
    ...(entry.kind === 'codemap' && { builtBy: entry.agent }),
    updatedAt,
    body,
  }
}

async function list(store: ContextRpcStore, caller: ContextCaller) {
  const entries: ContextIndexItem[] = (await store.entries(caller.project)).map(indexItem)
  return { entries, covers: CONTEXT_COVERAGE }
}

/**
 * Context tool calls from an agent, scoped to its terminal's project. `onProposed` tells the
 * UI a note is waiting for approval.
 */
export async function handleContextRpc(
  store: ContextRpcStore,
  caller: ContextCaller,
  method: string,
  params: unknown,
  onProposed: () => void,
): Promise<unknown> {
  switch (method) {
    case 'context.list':
      contextRpcSchemas.list.parse(params)
      return list(store, caller)
    case 'context.get': {
      const { id } = contextRpcSchemas.get.parse(params)
      const entry = await store.get(caller.project, id)
      if (!entry) throw new Error(`No context entry "${id}". Use list_context to see the ids.`)
      return entryForAgent(entry)
    }
    case 'context.search': {
      const { query } = contextRpcSchemas.search.parse(params)
      return { hits: searchContext(await store.entries(caller.project), query) }
    }
    case 'context.addNote': {
      const note = contextRpcSchemas.addNote.parse(params)
      const proposal = await store.propose(caller.project, note, caller.agent)
      onProposed()
      return {
        id: proposal.id,
        status: 'proposed',
        note: 'The user reviews it in Dugout; it is shared once approved.',
      }
    }
    default:
      throw new Error(`Unknown context operation: ${method}`)
  }
}
