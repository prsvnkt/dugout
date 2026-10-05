import type { GitCheckout } from '@shared/worktree'

/** Identifies one file on disk: project, checkout (main or worktree) and path. */
export function fileKeyOf(checkout: GitCheckout, path: string): string {
  return `${checkout.projectId}::${checkout.worktreePath ?? ''}::${path}`
}

export function checkoutOf(projectId: string, worktreePath: string | null): GitCheckout {
  return worktreePath ? { projectId, worktreePath } : { projectId }
}
