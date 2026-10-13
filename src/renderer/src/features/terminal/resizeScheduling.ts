/**
 * Keeps a splitter drag from flooding the agent with SIGWINCHs (decision 056): xterm fits at
 * most once per animation frame, and the PTY hears about the size once it has settled.
 */

/** Trailing delay before a new size reaches the PTY. */
export const RESIZE_SETTLE_MS = 75

export interface FrameScheduler {
  request(callback: () => void): number
  cancel(handle: number): void
}

export interface TimerScheduler {
  set(callback: () => void, delayMs: number): number
  clear(handle: number): void
}

export interface FrameCoalescer {
  schedule(): void
  dispose(): void
}

export interface TrailingDebounce<Args extends unknown[]> {
  call(...args: Args): void
  dispose(): void
}

export const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export const browserTimers: TimerScheduler = {
  set: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clear: (handle) => window.clearTimeout(handle),
}

/** Runs `run` in the next animation frame, once however many times it was scheduled. */
export function createFrameCoalescer(
  run: () => void,
  frames: FrameScheduler = browserFrames,
): FrameCoalescer {
  let handle: number | null = null
  let isDisposed = false
  return {
    schedule() {
      if (isDisposed || handle !== null) return
      handle = frames.request(() => {
        handle = null
        run()
      })
    },
    dispose() {
      isDisposed = true
      if (handle !== null) frames.cancel(handle)
      handle = null
    },
  }
}

/** Calls `fn` with the latest arguments once calls have stopped for `delayMs`. */
export function createTrailingDebounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
  timers: TimerScheduler = browserTimers,
): TrailingDebounce<Args> {
  let handle: number | null = null
  const clear = () => {
    if (handle !== null) timers.clear(handle)
    handle = null
  }
  return {
    call(...args) {
      clear()
      handle = timers.set(() => {
        handle = null
        fn(...args)
      }, delayMs)
    },
    dispose: clear,
  }
}
