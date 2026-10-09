import type { TerminalId } from '@shared/terminal'

/**
 * Most output a pane keeps while its `create()` call is in flight (decision 056). Startup
 * output is a few KB; the rest is other panes' output arriving in the same window.
 */
export const EARLY_OUTPUT_LIMIT_CHARS = 256 * 1024

interface Chunk {
  readonly id: TerminalId
  readonly data: string
}

interface Route {
  readonly id: TerminalId
  readonly sink: (data: string) => void
}

export interface OutputRouter {
  /** Feed every `terminal:data` event here, from before `create()` is called. */
  receive(id: TerminalId, data: string): void
  /** The PTY id is known: replays its buffered output to `sink`, then forwards new output. */
  connect(id: TerminalId, sink: (data: string) => void): void
  dispose(): void
}

/**
 * Subscribing only after `create()` resolves would rely on Electron delivering the invoke
 * reply before the first `terminal:data` event. Main sends the reply first today (the PTY's
 * data needs a later event-loop turn), but buffering from the start removes the dependency.
 */
export function createOutputRouter(limit: number = EARLY_OUTPUT_LIMIT_CHARS): OutputRouter {
  let early: readonly Chunk[] = []
  let earlySize = 0
  let route: Route | null = null
  let isDisposed = false

  const buffer = (chunk: Chunk) => {
    early = [...early, chunk]
    earlySize += chunk.data.length
    while (earlySize > limit && early.length > 0) {
      earlySize -= early[0]?.data.length ?? 0
      early = early.slice(1)
    }
  }

  return {
    receive(id, data) {
      if (isDisposed) return
      if (route === null) buffer({ id, data })
      else if (id === route.id) route.sink(data)
    },
    connect(id, sink) {
      if (isDisposed) return
      const replay = early.filter((chunk) => chunk.id === id)
      early = []
      earlySize = 0
      route = { id, sink }
      replay.forEach((chunk) => sink(chunk.data))
    },
    dispose() {
      isDisposed = true
      early = []
      route = null
    },
  }
}
