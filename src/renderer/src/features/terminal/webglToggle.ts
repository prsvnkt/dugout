/**
 * Chromium keeps only ~16 live WebGL contexts per renderer and silently drops the oldest
 * beyond that, so only panes of the visible project hold one (decision 056). Hidden panes use
 * xterm's DOM renderer, which costs little while `visibility: hidden` keeps them from painting.
 */
export interface WebglRenderer {
  dispose(): void
}

/** Loads a WebGL renderer, or returns null when WebGL is unavailable. */
export type LoadWebgl = (onContextLost: () => void) => WebglRenderer | null

export interface WebglToggle {
  setEnabled(isEnabled: boolean): void
  dispose(): void
}

export function createWebglToggle(load: LoadWebgl): WebglToggle {
  let renderer: WebglRenderer | null = null
  let isDisposed = false

  const release = () => {
    renderer?.dispose()
    renderer = null
  }

  const attach = () => {
    const loaded: WebglRenderer | null = load(() => {
      // xterm falls back to the DOM renderer; the next show tries WebGL again.
      if (renderer === loaded) release()
    })
    renderer = loaded
  }

  return {
    setEnabled(isEnabled) {
      if (isDisposed) return
      if (!isEnabled) release()
      else if (renderer === null) attach()
    },
    dispose() {
      isDisposed = true
      release()
    },
  }
}
