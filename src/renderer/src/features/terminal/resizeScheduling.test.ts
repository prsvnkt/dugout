import { describe, expect, it, vi } from 'vitest'
import { createFrameCoalescer, createTrailingDebounce } from './resizeScheduling'

function fakeFrames() {
  const callbacks = new Map<number, () => void>()
  let next = 0
  return {
    request: (callback: () => void) => {
      callbacks.set(++next, callback)
      return next
    },
    cancel: (handle: number) => {
      callbacks.delete(handle)
    },
    flush: () => {
      const due = [...callbacks.values()]
      callbacks.clear()
      due.forEach((callback) => callback())
    },
    pending: () => callbacks.size,
  }
}

function fakeTimers() {
  const timers = new Map<number, { at: number; callback: () => void }>()
  let now = 0
  let next = 0
  return {
    set: (callback: () => void, delayMs: number) => {
      timers.set(++next, { at: now + delayMs, callback })
      return next
    },
    clear: (handle: number) => {
      timers.delete(handle)
    },
    advance: (ms: number) => {
      now += ms
      for (const [handle, timer] of [...timers]) {
        if (timer.at > now) continue
        timers.delete(handle)
        timer.callback()
      }
    },
  }
}

describe('createFrameCoalescer', () => {
  it('runs once per animation frame however many times it is scheduled', () => {
    // Arrange
    const frames = fakeFrames()
    const run = vi.fn()
    const coalescer = createFrameCoalescer(run, frames)

    // Act
    for (let i = 0; i < 10; i++) coalescer.schedule()
    frames.flush()

    // Assert
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs again in a later frame when scheduled after running', () => {
    // Arrange
    const frames = fakeFrames()
    const run = vi.fn()
    const coalescer = createFrameCoalescer(run, frames)
    coalescer.schedule()
    frames.flush()

    // Act
    coalescer.schedule()
    frames.flush()

    // Assert
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending frame when disposed, and schedules nothing afterwards', () => {
    // Arrange
    const frames = fakeFrames()
    const run = vi.fn()
    const coalescer = createFrameCoalescer(run, frames)
    coalescer.schedule()

    // Act
    coalescer.dispose()
    coalescer.schedule()
    frames.flush()

    // Assert
    expect(run).not.toHaveBeenCalled()
    expect(frames.pending()).toBe(0)
  })
})

describe('createTrailingDebounce', () => {
  it('sends one trailing call with the latest arguments', () => {
    // Arrange
    const timers = fakeTimers()
    const send = vi.fn()
    const debounced = createTrailingDebounce(send, 75, timers)

    // Act
    debounced.call(80, 24)
    timers.advance(50)
    debounced.call(100, 30)
    timers.advance(50)
    debounced.call(120, 40)
    timers.advance(74)
    const sentEarly = send.mock.calls.length
    timers.advance(1)

    // Assert
    expect(sentEarly).toBe(0)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(120, 40)
  })

  it('drops a pending call when disposed', () => {
    // Arrange
    const timers = fakeTimers()
    const send = vi.fn()
    const debounced = createTrailingDebounce(send, 75, timers)
    debounced.call(80, 24)

    // Act
    debounced.dispose()
    timers.advance(100)

    // Assert
    expect(send).not.toHaveBeenCalled()
  })
})
