import { useEffect } from 'react'
import type { AppCommand } from '@shared/commands'
import { dugout } from '@renderer/lib/dugout'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { checkoutOf, fileKeyOf } from '@renderer/features/editor/fileKey'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useInboxStore } from '@renderer/features/inbox/inboxStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useWorkspaceStore } from './workspaceStore'

/** Routes native menu commands (and their shortcuts) to the stores. */
export function useAppCommands(onAddProject: () => void, onCloneProject: () => void): void {
  useEffect(() => {
    const handle = (command: AppCommand) => {
      const { selectedId, selectIndex } = useProjectsStore.getState()
      const workspace = useWorkspaceStore.getState()
      switch (command.type) {
        case 'project.add':
          onAddProject()
          return
        case 'project.clone':
          onCloneProject()
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
        case 'pane.close': {
          if (!selectedId) return
          // ⌘W closes the active editor tab when the editor had focus, otherwise the pane.
          const editor = useEditorStore.getState()
          const activeTab = editor.tabsByProject[selectedId]?.activeTabId
          if (workspace.focusedAreas[selectedId] === 'editor' && activeTab) {
            editor.requestClose(selectedId, activeTab)
          } else {
            workspace.closeFocusedPane(selectedId)
          }
          return
        }
        case 'editor.save': {
          if (!selectedId) return
          const editor = useEditorStore.getState()
          const tabs = editor.tabsByProject[selectedId]
          const active = tabs?.tabs.find((tab) => tab.id === tabs.activeTabId)
          if (active && !(active.kind === 'diff' && active.staged)) {
            void editor.save(fileKeyOf(checkoutOf(selectedId, active.worktreePath), active.path))
          }
          return
        }
        case 'editor.saveAll':
          if (selectedId) void useEditorStore.getState().saveAll(selectedId)
          return
        case 'inbox.toggle':
          useInboxStore.getState().toggle()
          return
        case 'explorer.toggle':
          useExplorerStore.getState().toggleOpen()
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
  }, [onAddProject, onCloneProject])
}
