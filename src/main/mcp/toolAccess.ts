/**
 * What each "dugout" MCP tool can do, the one place that decides which tools agents may call
 * without asking (decision 053). It has no dependencies, so agent adapters can read it too.
 *
 * - `read`: reads the project's tasks or context.
 * - `propose`: only proposes something that a person approves in Dugout (add_note).
 * - `write`: changes GitHub Issues or Linear under the user's account. Never pre-approved: a task
 *   description can be written by anyone, and it reaches the agent's first prompt.
 */
export type ToolAccess = 'read' | 'propose' | 'write'

export const DUGOUT_TOOLS = {
  list_tasks: 'read',
  get_task: 'read',
  create_task: 'write',
  create_tasks: 'write',
  update_task: 'write',
  comment_on_task: 'write',
  list_context: 'read',
  get_context: 'read',
  search_context: 'read',
  add_note: 'propose',
} as const satisfies Record<string, ToolAccess>

export type DugoutToolName = keyof typeof DUGOUT_TOOLS

/** Tools agents may call without a permission prompt: everything except writes. */
export const PRE_APPROVED_TOOLS: readonly DugoutToolName[] = (
  Object.keys(DUGOUT_TOOLS) as DugoutToolName[]
).filter((name) => DUGOUT_TOOLS[name] !== 'write')

/** MCP tool annotations (hints clients such as Codex use to decide whether to ask first). */
export interface DugoutToolAnnotations {
  readonly readOnlyHint: boolean
  readonly destructiveHint?: boolean
  readonly openWorldHint: boolean
}

const ANNOTATIONS: Readonly<Record<ToolAccess, DugoutToolAnnotations>> = {
  read: { readOnlyHint: true, openWorldHint: false },
  // A proposal changes nothing until a person approves it in Dugout.
  propose: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  // destructiveHint is left at its default (true): an update can overwrite a description.
  write: { readOnlyHint: false, openWorldHint: true },
}

export function toolAnnotations(name: DugoutToolName): DugoutToolAnnotations {
  return ANNOTATIONS[DUGOUT_TOOLS[name]]
}
