import { useShallow } from 'zustand/react/shallow'
import { EMPTY_LAYOUT } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { chooseDelivery, type Delivery } from './delivery'
import type { CommentCheckout } from './reviewCommentsStore'

/** Where a prompt for this checkout would go right now (kept live as agents come and go). */
export function useDelivery(checkout: CommentCheckout): Delivery {
  return useWorkspaceStore(
    useShallow((state) =>
      chooseDelivery({
        layout: state.layouts[checkout.projectId] ?? EMPTY_LAYOUT,
        activities: state.activities,
        terminalIds: state.terminalIds,
        worktreePath: checkout.worktreePath,
      }),
    ),
  )
}
