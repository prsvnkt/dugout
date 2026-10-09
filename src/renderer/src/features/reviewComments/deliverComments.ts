import { MAX_INITIAL_PROMPT_LENGTH } from '@shared/ipc/contract'
import type { Worktree } from '@shared/worktree'
import { useDefaultAgentStore } from '@renderer/features/start/defaultAgentStore'
import { sendPrompt } from '@renderer/features/terminal/terminalInput'
import { EMPTY_LAYOUT } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { chooseDelivery } from './delivery'
import { formatReviewPrompt } from './reviewPrompt'
import {
  useReviewCommentsStore,
  type CommentCheckout,
  type ReviewComment,
} from './reviewCommentsStore'

/** Shown when offering to resume an agent started with review comments. */
const SESSION_TITLE = 'Review comments'

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
async function startAgent(checkout: CommentCheckout, prompt: string): Promise<string | null> {
  const worktree = checkout.worktreePath ? await findWorktree(checkout) : undefined
  if (checkout.worktreePath && !worktree) return 'That worktree no longer exists.'
  const agents = useDefaultAgentStore.getState()
  await agents.load()
  const workspace = useWorkspaceStore.getState()
  const before = workspace.layouts[checkout.projectId]
  workspace.addPane(checkout.projectId, useDefaultAgentStore.getState().defaultAgent, worktree, {
    initialPrompt: prompt,
    title: SESSION_TITLE,
  })
  const isAdded = useWorkspaceStore.getState().layouts[checkout.projectId] !== before
  return isAdded ? null : 'This project has no room for another agent. Close one first.'
}

/**
 * Delivers a checkout's comments as one prompt: typed into the agent working there, or as the
 * first prompt of a new agent when none is. Delivered comments are cleared.
 * Resolves to an error to show, or null.
 */
export async function deliverComments(
  checkout: CommentCheckout,
  comments: readonly ReviewComment[],
): Promise<string | null> {
  if (comments.length === 0) return null
  const prompt = formatReviewPrompt(comments)
  if (prompt.length > MAX_INITIAL_PROMPT_LENGTH) {
    return 'These comments are too long to send at once. Send fewer, or shorten them.'
  }
  const workspace = useWorkspaceStore.getState()
  const delivery = chooseDelivery({
    layout: workspace.layouts[checkout.projectId] ?? EMPTY_LAYOUT,
    activities: workspace.activities,
    terminalIds: workspace.terminalIds,
    worktreePath: checkout.worktreePath,
  })
  if (delivery.kind === 'busy') return delivery.reason
  if (delivery.kind === 'send') {
    if (!sendPrompt(delivery.terminalId, prompt)) return 'The agent’s terminal is not running.'
    workspace.revealPane(checkout.projectId, delivery.paneId)
  } else {
    const error = await startAgent(checkout, prompt)
    if (error) return error
  }
  useReviewCommentsStore.getState().removeAll(comments.map((comment) => comment.id))
  return null
}
