import { MAX_INITIAL_PROMPT_LENGTH } from '@shared/ipc/contract'
import type { Worktree } from '@shared/worktree'
import { useDefaultAgentStore } from '@renderer/features/start/defaultAgentStore'
import { sendPrompt } from '@renderer/features/terminal/terminalInput'
import { EMPTY_LAYOUT } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { chooseDelivery } from './delivery'
import type { CommentCheckout } from './reviewCommentsStore'

async function findWorktree(checkout: CommentCheckout): Promise<Worktree | undefined> {
  const { projectId, worktreePath } = checkout
  const find = () =>
    useWorktreeStore
      .getState()
      .byProject[projectId]?.find((worktree) => worktree.path === worktreePath)
  if (find()) return find()
  await useWorktreeStore.getState().load(projectId)
  return find()
}

/** Starts the default agent on the checkout with the prompt as its first message. */
async function startAgent(
  checkout: CommentCheckout,
  prompt: string,
  title: string,
): Promise<string | null> {
  const worktree = checkout.worktreePath ? await findWorktree(checkout) : undefined
  if (checkout.worktreePath && !worktree) return 'That worktree no longer exists.'
  const agents = useDefaultAgentStore.getState()
  await agents.load()
  const workspace = useWorkspaceStore.getState()
  const before = workspace.layouts[checkout.projectId]
  workspace.addPane(checkout.projectId, useDefaultAgentStore.getState().defaultAgent, worktree, {
    initialPrompt: prompt,
    title,
  })
  const isAdded = useWorkspaceStore.getState().layouts[checkout.projectId] !== before
  return isAdded ? null : 'This project has no room for another agent. Close one first.'
}

/**
 * Delivers a prompt to a checkout's agent: typed into the agent working there, or as the first
 * prompt of a new default agent (named `title` when offered for resume) when none is.
 * Resolves to an error to show, or null.
 */
export async function deliverPrompt(
  checkout: CommentCheckout,
  prompt: string,
  title: string,
): Promise<string | null> {
  if (prompt.length > MAX_INITIAL_PROMPT_LENGTH) {
    return 'This is too long to send at once. Send less, or shorten it.'
  }
  const workspace = useWorkspaceStore.getState()
  const delivery = chooseDelivery({
    layout: workspace.layouts[checkout.projectId] ?? EMPTY_LAYOUT,
    activities: workspace.activities,
    terminalIds: workspace.terminalIds,
    worktreePath: checkout.worktreePath,
  })
  if (delivery.kind === 'busy') return delivery.reason
  if (delivery.kind === 'start') return startAgent(checkout, prompt, title)
  if (!sendPrompt(delivery.terminalId, prompt)) return 'The agent’s terminal is not running.'
  workspace.revealPane(checkout.projectId, delivery.paneId)
  return null
}
