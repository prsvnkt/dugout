import { describe, expect, it, vi } from 'vitest'
import { createOutputRouter } from './outputRouter'

describe('createOutputRouter', () => {
  it('delivers output that arrived before the terminal id was known, in order', () => {
    // Arrange
    const router = createOutputRouter(1000)
    const sink = vi.fn()
    router.receive('t1', 'hello ')
    router.receive('t2', 'other pane')
    router.receive('t1', 'world')

    // Act
    router.connect('t1', sink)

    // Assert
    expect(sink.mock.calls).toEqual([['hello '], ['world']])
  })

  it('routes only its own terminal output once connected', () => {
    // Arrange
    const router = createOutputRouter(1000)
    const sink = vi.fn()
    router.connect('t1', sink)

    // Act
    router.receive('t2', 'other pane')
    router.receive('t1', 'mine')

    // Assert
    expect(sink.mock.calls).toEqual([['mine']])
  })

  it('keeps at most the buffer limit before connecting, dropping the oldest output', () => {
    // Arrange
    const router = createOutputRouter(10)
    const sink = vi.fn()
    router.receive('t1', 'old')
    router.receive('t2', 'x'.repeat(8))
    router.receive('t1', 'abcdef')

    // Act
    router.connect('t1', sink)

    // Assert
    expect(sink.mock.calls).toEqual([['abcdef']])
  })

  it('ignores output after it is disposed', () => {
    // Arrange
    const router = createOutputRouter(1000)
    const sink = vi.fn()
    router.connect('t1', sink)

    // Act
    router.dispose()
    router.receive('t1', 'late')

    // Assert
    expect(sink).not.toHaveBeenCalled()
  })
})
