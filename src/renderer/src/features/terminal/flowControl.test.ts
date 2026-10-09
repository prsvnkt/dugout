import { describe, expect, it, vi } from 'vitest'
import { createFlowControl } from './flowControl'

const LIMITS = { highWater: 100, lowWater: 30 }

function setup() {
  const pending: Array<() => void> = []
  const target = {
    write: vi.fn((_data: string, done: () => void) => {
      pending.push(done)
    }),
    pause: vi.fn(),
    resume: vi.fn(),
  }
  const flow = createFlowControl(target, LIMITS)
  const drain = (count: number) => pending.splice(0, count).forEach((done) => done())
  return { target, flow, drain }
}

describe('createFlowControl', () => {
  it('writes every chunk to the terminal without pausing below the high-water mark', () => {
    // Arrange
    const { target, flow } = setup()

    // Act
    flow.write('a'.repeat(50))
    flow.write('b'.repeat(50))

    // Assert
    expect(target.write).toHaveBeenCalledTimes(2)
    expect(target.pause).not.toHaveBeenCalled()
  })

  it('pauses once when pending output crosses the high-water mark', () => {
    // Arrange
    const { target, flow } = setup()

    // Act
    flow.write('a'.repeat(80))
    flow.write('b'.repeat(40))
    flow.write('c'.repeat(40))

    // Assert
    expect(target.pause).toHaveBeenCalledTimes(1)
    expect(target.write).toHaveBeenCalledTimes(3)
  })

  it('resumes once when pending output drains below the low-water mark', () => {
    // Arrange
    const { target, flow, drain } = setup()
    flow.write('a'.repeat(60))
    flow.write('b'.repeat(60))
    flow.write('c'.repeat(20))

    // Act
    drain(1) // 80 pending: still above low water
    const resumedEarly = target.resume.mock.calls.length
    drain(1) // 20 pending
    drain(1) // 0 pending

    // Assert
    expect(resumedEarly).toBe(0)
    expect(target.resume).toHaveBeenCalledTimes(1)
  })

  it('pauses again on a second burst after resuming', () => {
    // Arrange
    const { target, flow, drain } = setup()
    flow.write('a'.repeat(120))
    drain(1)

    // Act
    flow.write('b'.repeat(120))

    // Assert
    expect(target.pause).toHaveBeenCalledTimes(2)
    expect(target.resume).toHaveBeenCalledTimes(1)
  })

  it('stops asking main to resume once disposed', () => {
    // Arrange
    const { target, flow, drain } = setup()
    flow.write('a'.repeat(120))

    // Act
    flow.dispose()
    drain(1)

    // Assert
    expect(target.resume).not.toHaveBeenCalled()
  })
})
