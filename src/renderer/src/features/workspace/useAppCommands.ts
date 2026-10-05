import { useEffect } from 'react'
import type { AppCommand } from '@shared/commands'
import { dugout } from '@renderer/lib/dugout'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useWorkspaceStore } from './workspaceStore'

/** Routes native menu commands (and their shortcuts) to the stores. */
export function useAppCommands(onAddProject: () => void): void {
  useEffect(() => {
    const handle = (command: AppCommand) => {
      const { selectedId, selectIndex } = useProjectsStore.getState()
      const workspace = useWorkspaceStore.getState()
      switch (command.type) {
        case 'project.add':
          onAddProject()
          return
        case 'project.select':
          selectIndex(command.index)
          return
        case 'pane.new':
          if (selectedId) workspace.addPane(selectedId, command.kind)
          return
        case 'pane.newWorktree':
          if (selectedId) void useWorktreeStore.getState().startSession(selectedId)
          return
        case 'pane.close':
          if (selectedId) workspace.closeFocusedPane(selectedId)
          return
        case 'git.togglePanel':
          useGitStore.getState().togglePanel()
          return
        case 'terminal.reveal': {
          const target = workspace.findTerminal(command.terminalId)
          if (!target) return
          useProjectsStore.getState().select(target.projectId)
          workspace.focusPane(target.projectId, target.paneId)
          return
        }
      }
    }
    return dugout.onCommand(handle)
  }, [onAddProject])
}
