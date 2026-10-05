/** Commands the native application menu sends to the renderer. */
export type AppCommand =
  | { readonly type: 'pane.new'; readonly kind: 'claude' | 'shell' }
  | { readonly type: 'pane.newWorktree' }
  | { readonly type: 'pane.close' }
  | { readonly type: 'project.add' }
  | { readonly type: 'project.select'; readonly index: number }
  | { readonly type: 'git.togglePanel' }
  | { readonly type: 'explorer.toggle' }
  | { readonly type: 'editor.save' }
  | { readonly type: 'editor.saveAll' }
  /** Show the pane running this terminal, e.g. after clicking a notification. */
  | { readonly type: 'terminal.reveal'; readonly terminalId: string }
