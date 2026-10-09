import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { GitCheckout } from '@shared/worktree'
import { Icon } from '@renderer/lib/Icon'
import { useGitStore } from './gitStore'
import styles from './GitPanel.module.css'

interface FetchButtonProps {
  readonly checkout: GitCheckout
  /** Another git action is running in this checkout. */
  readonly isBusy: boolean
}

/** Fetches every remote so ↑/↓ and remote branches are current. Spins only while fetching. */
export function FetchButton({ checkout, isBusy }: FetchButtonProps) {
  const fetch = useGitStore((state) => state.fetch)
  const [isFetching, setIsFetching] = useState(false)

  const run = async () => {
    setIsFetching(true)
    try {
      await fetch(checkout)
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <button
      className={styles.iconButton}
      onClick={() => void run()}
      disabled={isBusy || isFetching}
      data-fetching={isFetching}
      title={isFetching ? 'Fetching…' : 'Fetch from all remotes'}
      aria-label="Fetch from remotes"
    >
      <Icon icon={RefreshCw} className={styles.fetchGlyph} />
    </button>
  )
}
