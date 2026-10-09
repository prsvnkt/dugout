import { useCallback, useEffect, useState } from 'react'
import { dugout } from '@renderer/lib/dugout'
import type { ExternalAppId, OpenInApps } from '@shared/openIn'
import { unwrap } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'

export type OpenInState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly apps: OpenInApps }
  | { readonly state: 'error'; readonly message: string }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * The apps to offer while the menu is open (looked up each time, so newly installed editors
 * show up), and `open`, which resolves to an error message or null when the app opened.
 */
export function useOpenIn(
  checkout: GitCheckout,
  isOpen: boolean,
): {
  readonly apps: OpenInState
  open(app: ExternalAppId): Promise<string | null>
} {
  const [apps, setApps] = useState<OpenInState>({ state: 'loading' })

  useEffect(() => {
    if (!isOpen) return
    let isCurrent = true
    dugout.openIn
      .apps()
      .then((result) => {
        if (isCurrent) setApps({ state: 'ready', apps: unwrap(result) })
      })
      .catch((error: unknown) => {
        console.warn('[open-in] could not list apps', error)
        if (isCurrent) setApps({ state: 'error', message: messageOf(error) })
      })
    return () => {
      isCurrent = false
      // Next time the menu opens, it looks the apps up again.
      setApps({ state: 'loading' })
    }
  }, [isOpen])

  const { projectId, worktreePath } = checkout
  const open = useCallback(
    async (app: ExternalAppId): Promise<string | null> => {
      try {
        unwrap(await dugout.openIn.open({ projectId, worktreePath }, app))
        return null
      } catch (error) {
        console.warn('[open-in] could not open', error)
        return messageOf(error)
      }
    },
    [projectId, worktreePath],
  )

  return { apps, open }
}
