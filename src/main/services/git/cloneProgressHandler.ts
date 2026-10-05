import type { CloneProgress } from '@shared/clone'
import { parseCloneProgress } from './cloneProgress'

/** Turns stderr chunks into progress callbacks, skipping repeats. */
export function cloneProgressHandler(onProgress: (progress: CloneProgress) => void) {
  let last = ''
  return (chunk: string) => {
    const progress = parseCloneProgress(chunk)
    if (!progress) return
    const key = `${progress.phase}:${progress.percent ?? ''}`
    if (key === last) return
    last = key
    onProgress(progress)
  }
}
