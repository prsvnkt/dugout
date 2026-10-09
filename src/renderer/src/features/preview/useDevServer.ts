import { useCallback, useState } from 'react'
import type { Project } from '@shared/project'
import type { GitCheckout } from '@shared/worktree'
import type { Pane } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useProjectWorktrees } from '@renderer/features/worktrees/worktreeStore'
import { dugout } from '@renderer/lib/dugout'
import { devServerPane, reservedPorts } from './devServers'

export interface DevServerControls {
  /** The checkout's open dev server shell, if any. */
  readonly pane: Pane | null
  readonly error: string | null
  readonly isStarting: boolean
  /** Opens a shell in the checkout with a free `PORT` and types the project's dev command. */
  run(): Promise<void>
  /** Shows the dev server's shell and puts the keyboard in it. */
  show(): void
}

/** Runs the project's dev command in a shell of the given checkout, one per checkout. */
export function useDevServer(project: Project, checkout: GitCheckout): DevServerControls {
  const worktreePath = checkout.worktreePath ?? null
  const pane = useWorkspaceStore((state) => devServerPane(state.layouts[project.id], worktreePath))
  const worktrees = useProjectWorktrees(project.id)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  const run = useCallback(async () => {
    const command = project.devCommand
    const worktree = worktrees.find((candidate) => candidate.path === worktreePath)
    if (!command || (worktreePath && !worktree)) return
    setError(null)
    setIsStarting(true)
    const port = await dugout.preview.assignPort(
      reservedPorts(useWorkspaceStore.getState().layouts),
    )
    setIsStarting(false)
    if (!port.ok) {
      setError(port.error)
      return
    }
    const { addPane, layouts } = useWorkspaceStore.getState()
    const before = layouts[project.id]
    addPane(project.id, 'shell', worktree, { devServer: { command, port: port.data } })
    if (useWorkspaceStore.getState().layouts[project.id] === before) {
      setError('No room for another shell. Close an agent or shell, then run it again.')
    }
  }, [project.id, project.devCommand, worktrees, worktreePath])

  const show = useCallback(() => {
    if (pane) useWorkspaceStore.getState().revealPane(project.id, pane.id)
  }, [project.id, pane])

  return { pane, error, isStarting, run, show }
}
