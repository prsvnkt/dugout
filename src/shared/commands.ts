/** Commands the native application menu sends to the renderer. */
export type AppCommand =
  | { readonly type: 'pane.new'; readonly kind: 'claude' | 'shell' }
  | { readonly type: 'pane.close' }
  | { readonly type: 'project.add' }
  | { readonly type: 'project.select'; readonly index: number }
  | { readonly type: 'git.togglePanel' }
