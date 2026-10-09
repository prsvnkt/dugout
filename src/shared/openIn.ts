/** Apps a project or worktree folder can be opened in, from Dugout. */
export const EXTERNAL_APP_IDS = ['vscode', 'cursor', 'zed', 'finder'] as const

export type ExternalAppId = (typeof EXTERNAL_APP_IDS)[number]

/** Names shown in the "Open in…" menu. */
export const EXTERNAL_APP_LABEL: Readonly<Record<ExternalAppId, string>> = {
  vscode: 'VS Code',
  cursor: 'Cursor',
  zed: 'Zed',
  finder: 'Finder',
}

/** What the "Open in…" menu offers: the installed apps, in menu order, and the last one used. */
export interface OpenInApps {
  readonly installed: readonly ExternalAppId[]
  /** Null until something was opened, or when that app is no longer installed. */
  readonly lastUsed: ExternalAppId | null
}
