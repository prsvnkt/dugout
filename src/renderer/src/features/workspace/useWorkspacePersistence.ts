import { useEffect } from 'react'
import { dugout } from '@renderer/lib/dugout'
import { toSnapshot, useWorkspaceStore } from './workspaceStore'

const SAVE_DEBOUNCE_MS = 500

/**
 * Restores saved panes once projects have loaded, then saves layout changes (debounced).
 * Saving starts only after the restore, so an empty startup state never overwrites the file.
 */
export function useWorkspacePersistence(areProjectsLoaded: boolean): void {
  useEffect(() => {
    if (!areProjectsLoaded) return
    let timer: number | undefined
    let unsubscribe: (() => void) | undefined
    let isCancelled = false

    const saveSoon = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const { layouts, recentSessions } = useWorkspaceStore.getState()
        const snapshot = toSnapshot(layouts, recentSessions)
        void dugout.workspace.save(snapshot).then((result) => {
          if (!result.ok) console.error('[workspace] could not save layout:', result.error)
        })
      }, SAVE_DEBOUNCE_MS)
    }

    void dugout.workspace.load().then((result) => {
      if (isCancelled) return
      if (result.ok) useWorkspaceStore.getState().hydrate(result.data)
      else {
        console.error('[workspace] could not restore layout:', result.error)
        useWorkspaceStore.getState().markRestored()
      }
      unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
        const hasChanged =
          state.layouts !== previous.layouts || state.recentSessions !== previous.recentSessions
        if (hasChanged) saveSoon()
      })
    })

    return () => {
      isCancelled = true
      window.clearTimeout(timer)
      unsubscribe?.()
    }
  }, [areProjectsLoaded])
}
