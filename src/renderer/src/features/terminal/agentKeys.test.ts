import { describe, expect, it } from 'vitest'
import { agentKeyOverride, AGENT_NEWLINE } from './agentKeys'

type KeyInit = Partial<
  Pick<
    KeyboardEvent,
    'type' | 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'isComposing'
  >
>

function key(init: KeyInit): KeyboardEvent {
  return {
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...init,
  } as KeyboardEvent
}

describe('agentKeyOverride', () => {
  it('sends a line feed for Shift+Enter, so agents insert a new line', () => {
    expect(agentKeyOverride(key({ shiftKey: true }))).toBe(AGENT_NEWLINE)
  })

  it('leaves plain Enter alone, so it still submits', () => {
    expect(agentKeyOverride(key({}))).toBeNull()
  })

  it('ignores Shift+Enter keyup and while composing (IME)', () => {
    expect(agentKeyOverride(key({ shiftKey: true, type: 'keyup' }))).toBeNull()
    expect(agentKeyOverride(key({ shiftKey: true, isComposing: true }))).toBeNull()
  })

  it('ignores Shift+Enter combined with other modifiers', () => {
    expect(agentKeyOverride(key({ shiftKey: true, metaKey: true }))).toBeNull()
    expect(agentKeyOverride(key({ shiftKey: true, altKey: true }))).toBeNull()
  })

  it('ignores other keys', () => {
    expect(agentKeyOverride(key({ key: 'a', shiftKey: true }))).toBeNull()
  })
})
