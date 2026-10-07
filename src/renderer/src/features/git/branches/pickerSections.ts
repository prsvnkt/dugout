import type { GitBranch } from '@shared/git'
import { SESSION_BRANCH_PREFIX } from '@shared/worktree'

/** What the picker is doing: switching branches, or choosing where a new branch starts. */
export type PickerMode =
  { readonly kind: 'switch' } | { readonly kind: 'base'; readonly newName: string }

export type PickerItem =
  /** Create the typed name at HEAD and switch to it. */
  | { readonly kind: 'create'; readonly id: string; readonly name: string }
  /** Create the typed name from a branch chosen next. */
  | { readonly kind: 'createFrom'; readonly id: string; readonly name: string }
  /** Start an agent in its own worktree instead of touching this checkout. */
  | { readonly kind: 'worktree'; readonly id: string }
  /** Expands or collapses the agent session branches. */
  | {
      readonly kind: 'sessions'
      readonly id: string
      readonly count: number
      readonly isExpanded: boolean
    }
  | {
      readonly kind: 'branch'
      readonly id: string
      readonly branch: GitBranch
      /** Why it cannot be picked, shown instead of acting on it; null when it can. */
      readonly disabledReason: string | null
    }

export interface PickerOptions {
  /** Whether the agent session branches (dugout/*) are expanded; searching always shows them. */
  readonly showSessions: boolean
}

export interface PickerSection {
  readonly title: string | null
  readonly items: readonly PickerItem[]
}

function matches(branch: GitBranch, query: string): boolean {
  const needle = query.toLowerCase()
  return branch.name.toLowerCase().includes(needle)
}

function disabledReason(branch: GitBranch, mode: PickerMode): string | null {
  if (mode.kind === 'base' || branch.kind === 'remote') return null
  if (branch.isCurrent) return 'current'
  return branch.checkedOutAt ? 'in a worktree' : null
}

function branchItems(branches: readonly GitBranch[], mode: PickerMode): PickerItem[] {
  return branches.map((branch) => ({
    kind: 'branch',
    id: `${branch.kind}:${branch.name}`,
    branch,
    disabledReason: disabledReason(branch, mode),
  }))
}

function actionItems(branches: readonly GitBranch[], query: string): PickerItem[] {
  const name = query.trim()
  const exists = branches.some((branch) => branch.kind === 'local' && branch.name === name)
  const create: PickerItem[] =
    name && !exists
      ? [
          { kind: 'create', id: 'create', name },
          { kind: 'createFrom', id: 'createFrom', name },
        ]
      : []
  return [...create, { kind: 'worktree', id: 'worktree' }]
}

function isSessionBranch(branch: GitBranch): boolean {
  const name = branch.kind === 'local' ? branch.name : branch.localName
  return name.startsWith(SESSION_BRANCH_PREFIX)
}

/** Session branches sit last, behind a toggle, so the user's own branches come first. */
function sessionItems(
  sessions: readonly GitBranch[],
  mode: PickerMode,
  isSearching: boolean,
  showSessions: boolean,
): PickerItem[] {
  if (sessions.length === 0) return []
  if (isSearching) return branchItems(sessions, mode)
  const toggle: PickerItem = {
    kind: 'sessions',
    id: 'sessions',
    count: sessions.length,
    isExpanded: showSessions,
  }
  return showSessions ? [toggle, ...branchItems(sessions, mode)] : [toggle]
}

/** The picker's sections for `query`; empty sections are left out. */
export function pickerSections(
  branches: readonly GitBranch[],
  query: string,
  mode: PickerMode,
  { showSessions }: PickerOptions,
): PickerSection[] {
  const needle = query.trim()
  const visible = branches.filter((branch) => matches(branch, needle))
  const own = visible.filter((branch) => !isSessionBranch(branch))
  const sessions = visible.filter(isSessionBranch)
  const sections: PickerSection[] = [
    ...(mode.kind === 'switch' ? [{ title: null, items: actionItems(branches, query) }] : []),
    {
      title: 'Branches',
      items: branchItems(
        own.filter((branch) => branch.kind === 'local'),
        mode,
      ),
    },
    {
      title: 'Remote branches',
      items: branchItems(
        own.filter((branch) => branch.kind === 'remote'),
        mode,
      ),
    },
    { title: 'Agent sessions', items: sessionItems(sessions, mode, needle !== '', showSessions) },
  ]
  return sections.filter((section) => section.items.length > 0)
}
