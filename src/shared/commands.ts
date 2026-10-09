import type { TerminalKind } from './terminal'

/** Commands the native application menu sends to the renderer. */
export type AppCommand =
  | { readonly type: 'pane.new'; readonly kind: TerminalKind }
  /** The default agent (settings), in the focused checkout or in a new worktree. */
  | { readonly type: 'pane.newDefaultAgent' }
  | { readonly type: 'pane.newWorktree' }
  | { readonly type: 'pane.close' }
  | { readonly type: 'project.add' }
  | { readonly type: 'project.clone' }
  | { readonly type: 'project.select'; readonly index: number }
  | { readonly type: 'git.togglePanel' }
  | { readonly type: 'explorer.toggle' }
  | { readonly type: 'inbox.toggle' }
  | { readonly type: 'agentSettings.open' }
  | { readonly type: 'editor.save' }
  | { readonly type: 'editor.saveAll' }
  /** Show the pane running this terminal, e.g. after clicking a notification. */
  | { readonly type: 'terminal.reveal'; readonly terminalId: string }
