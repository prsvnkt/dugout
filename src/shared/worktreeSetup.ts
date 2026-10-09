/**
 * What a project's new worktrees get before their first agent starts (opt-in, per project):
 * local files copied from the main checkout, then a setup command run in the worktree.
 */
export interface WorktreeSetup {
  /** Globs relative to the repo root, e.g. `.env*` or `config/*.local.json`. */
  readonly copy: readonly string[]
  /** Shown in the agent's terminal while it runs, e.g. `npm install`. */
  readonly command?: string | undefined
}

export const MAX_COPY_PATTERNS = 20
export const MAX_COPY_PATTERN_LENGTH = 200
export const MAX_SETUP_COMMAND_LENGTH = 1000
/** More files than this are dependencies or build output: install them with the command. */
export const MAX_COPIED_FILES = 500

/** A glob that can only match inside the repo, never in `.git`. */
export function isSafeCopyPattern(pattern: string): boolean {
  if (pattern === '' || pattern.startsWith('/') || pattern.includes('\0')) return false
  const segments = pattern.split('/')
  return !segments.includes('..') && !segments.includes('.git')
}

/** One pattern per line (or comma-separated), blank entries dropped. */
export function parseCopyPatterns(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern !== '')
}

/** True when the setup copies nothing and runs nothing. */
export function isEmptySetup(setup: WorktreeSetup): boolean {
  return setup.copy.length === 0 && !setup.command
}
