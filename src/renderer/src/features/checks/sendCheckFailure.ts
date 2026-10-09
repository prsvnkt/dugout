import type { TerminalId } from '@shared/terminal'
import { deliverPrompt } from '@renderer/features/reviewComments/deliverPrompt'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { checkFailurePrompt, type FailedCheck } from './checks'

/** Shown when offering to resume an agent started with a check failure. */
const SESSION_TITLE = 'Check failure'

/**
 * "Send failure to agent": delivers the failed check's command and output to the agent on the
 * checkout the check ran in, like review comments (decision 041). Resolves to an error, or null.
 */
export async function sendCheckFailure(
  terminalId: TerminalId,
  check: FailedCheck,
): Promise<string | null> {
  const workspace = useWorkspaceStore.getState()
  const found = workspace.findTerminal(terminalId)
  if (!found) return 'The agent is not running.'
  const pane = workspace.layouts[found.projectId]?.panes.find((p) => p.id === found.paneId)
  const checkout = { projectId: found.projectId, worktreePath: pane?.worktree?.path ?? null }
  return deliverPrompt(checkout, checkFailurePrompt(check), SESSION_TITLE)
}
