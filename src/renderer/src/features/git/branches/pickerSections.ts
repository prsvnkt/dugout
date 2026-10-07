import type { GitBranch } from '@shared/git'

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
  | {
      readonly kind: 'branch'
      readonly id: string
      readonly branch: GitBranch
      /** Why it cannot be picked, shown instead of acting on it; null when it can. */
      readonly disabledReason: string | null
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

/** The picker's sections for `query`; empty sections are left out. */
export function pickerSections(
  branches: readonly GitBranch[],
  query: string,
  mode: PickerMode,
): PickerSection[] {
  const visible = branches.filter((branch) => matches(branch, query.trim()))
  const sections: PickerSection[] = [
    ...(mode.kind === 'switch' ? [{ title: null, items: actionItems(branches, query) }] : []),
    {
      title: 'Branches',
      items: branchItems(
        visible.filter((branch) => branch.kind === 'local'),
        mode,
      ),
    },
    {
      title: 'Remote branches',
      items: branchItems(
        visible.filter((branch) => branch.kind === 'remote'),
        mode,
      ),
    },
  ]
  return sections.filter((section) => section.items.length > 0)
}
