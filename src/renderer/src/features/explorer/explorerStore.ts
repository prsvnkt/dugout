import { create } from 'zustand'
import type { DirEntry } from '@shared/files'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { checkoutKey } from '@renderer/features/git/gitStore'

export interface CheckoutTree {
  /** Loaded folder listings by repo-relative path; '' is the root. */
  readonly entries: Readonly<Record<string, readonly DirEntry[]>>
  readonly expanded: readonly string[]
  readonly error: string | null
}

const EMPTY_TREE: CheckoutTree = { entries: {}, expanded: [], error: null }

interface ExplorerState {
  readonly trees: Readonly<Record<string, CheckoutTree>>
  readonly isOpen: boolean
  toggleOpen(): void
  toggleDir(checkout: GitCheckout, path: string): Promise<void>
  collapseAll(checkout: GitCheckout): void
  /** Re-reads the root and every expanded folder (cheap; runs on the refresh timer). */
  refresh(checkout: GitCheckout): Promise<void>
}

const refreshesInFlight = new Set<string>()

export const useExplorerStore = create<ExplorerState>()((set, get) => {
  const treeOf = (key: string) => get().trees[key] ?? EMPTY_TREE
  const patch = (key: string, change: (tree: CheckoutTree) => CheckoutTree) =>
    set((state) => ({ trees: { ...state.trees, [key]: change(state.trees[key] ?? EMPTY_TREE) } }))

  const load = async (checkout: GitCheckout, path: string) => {
    const key = checkoutKey(checkout)
    const result = await dugout.files.readDir(checkout, path)
    if (!result.ok) {
      // A folder that vanished (e.g. deleted by an agent) simply collapses.
      patch(key, (tree) => ({
        ...tree,
        expanded: tree.expanded.filter((dir) => dir !== path),
        error: path === '' ? result.error : tree.error,
      }))
      return
    }
    patch(key, (tree) => {
      const previous = tree.entries[path]
      const isSame = previous && JSON.stringify(previous) === JSON.stringify(result.data)
      return isSame
        ? tree
        : { ...tree, entries: { ...tree.entries, [path]: result.data }, error: null }
    })
  }

  return {
    trees: {},
    isOpen: true,
    toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

    async toggleDir(checkout, path) {
      const key = checkoutKey(checkout)
      const isExpanded = treeOf(key).expanded.includes(path)
      patch(key, (tree) => ({
        ...tree,
        expanded: isExpanded
          ? tree.expanded.filter((dir) => dir !== path)
          : [...tree.expanded, path],
      }))
      if (!isExpanded) await load(checkout, path)
    },

    collapseAll: (checkout) => patch(checkoutKey(checkout), (tree) => ({ ...tree, expanded: [] })),

    async refresh(checkout) {
      const key = checkoutKey(checkout)
      if (refreshesInFlight.has(key)) return
      refreshesInFlight.add(key)
      try {
        await Promise.all(['', ...treeOf(key).expanded].map((path) => load(checkout, path)))
      } finally {
        refreshesInFlight.delete(key)
      }
    },
  }
})

export function useCheckoutTree(checkout: GitCheckout): CheckoutTree {
  const key = checkoutKey(checkout)
  return useExplorerStore((state) => state.trees[key] ?? EMPTY_TREE)
}
