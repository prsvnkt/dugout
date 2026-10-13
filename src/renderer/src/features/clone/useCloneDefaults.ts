import { dugout } from '@renderer/lib/dugout'
import { useRequest } from '@renderer/lib/useRequest'

/** Where clones go by default (the folder remembered from the last clone); null until known. */
export function useCloneDefaultParent(): string | null {
  const state = useRequest(() => dugout.clone.defaults(), [])
  return state.kind === 'loaded' ? state.value.parentDir : null
}
