import { describe, expect, it, vi } from 'vitest'
import { createWebglToggle, type WebglRenderer } from './webglToggle'

function setup() {
  const contexts: Array<{ dispose: ReturnType<typeof vi.fn>; lose: () => void }> = []
  const load = vi.fn((onLost: () => void): WebglRenderer => {
    const context = { dispose: vi.fn(), lose: onLost }
    contexts.push(context)
    return context
  })
  return { contexts, load, toggle: createWebglToggle(load) }
}

describe('createWebglToggle', () => {
  it('loads one WebGL renderer while enabled, however often it is enabled', () => {
    // Arrange
    const { load, toggle } = setup()

    // Act
    toggle.setEnabled(true)
    toggle.setEnabled(true)

    // Assert
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('releases the WebGL context when disabled and loads a new one when enabled again', () => {
    // Arrange
    const { contexts, load, toggle } = setup()
    toggle.setEnabled(true)

    // Act
    toggle.setEnabled(false)
    toggle.setEnabled(true)

    // Assert
    expect(contexts[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('never loads while disabled', () => {
    // Arrange
    const { load, toggle } = setup()

    // Act
    toggle.setEnabled(false)

    // Assert
    expect(load).not.toHaveBeenCalled()
  })

  it('falls back to the DOM renderer when the context is lost, and retries on the next show', () => {
    // Arrange
    const { contexts, load, toggle } = setup()
    toggle.setEnabled(true)

    // Act
    contexts[0]?.lose()
    toggle.setEnabled(false)
    toggle.setEnabled(true)

    // Assert
    expect(contexts[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('keeps the DOM renderer when WebGL cannot load', () => {
    // Arrange
    const load = vi.fn(() => null)
    const toggle = createWebglToggle(load)

    // Act
    toggle.setEnabled(true)
    toggle.dispose()

    // Assert
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('releases the context when disposed, and never loads afterwards', () => {
    // Arrange
    const { contexts, load, toggle } = setup()
    toggle.setEnabled(true)

    // Act
    toggle.dispose()
    toggle.setEnabled(true)

    // Assert
    expect(contexts[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
