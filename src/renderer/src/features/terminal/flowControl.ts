/**
 * Backpressure for PTY output (decision 056). xterm parses writes asynchronously; without a
 * limit a burst (`cat` of a big file, a build log) queues unbounded data and starves the UI.
 * We count characters written but not yet parsed, ask main to pause the PTY above the
 * high-water mark and resume it below the low-water mark. Characters stand in for bytes.
 */
export const FLOW_HIGH_WATER_CHARS = 1024 * 1024
export const FLOW_LOW_WATER_CHARS = 256 * 1024

export interface FlowLimits {
  readonly highWater: number
  readonly lowWater: number
}

export interface FlowTarget {
  /** Writes to the terminal; `done` runs once xterm has parsed the chunk. */
  write(data: string, done: () => void): void
  pause(): void
  resume(): void
}

export interface FlowControl {
  write(data: string): void
  /** Stops pausing or resuming (the pane is closing; its PTY is killed anyway). */
  dispose(): void
}

const DEFAULT_LIMITS: FlowLimits = {
  highWater: FLOW_HIGH_WATER_CHARS,
  lowWater: FLOW_LOW_WATER_CHARS,
}

export function createFlowControl(
  target: FlowTarget,
  limits: FlowLimits = DEFAULT_LIMITS,
): FlowControl {
  let pending = 0
  let isPaused = false
  let isDisposed = false

  const onParsed = (size: number) => {
    pending -= size
    if (isDisposed || !isPaused || pending > limits.lowWater) return
    isPaused = false
    target.resume()
  }

  return {
    write(data) {
      if (isDisposed) return
      pending += data.length
      target.write(data, () => onParsed(data.length))
      if (isPaused || pending <= limits.highWater) return
      isPaused = true
      target.pause()
    },
    dispose() {
      isDisposed = true
    },
  }
}
