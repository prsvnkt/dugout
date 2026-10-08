import { describe, expect, test } from 'vitest'
import { PROJECT_COLORS } from '@shared/project'
import { assignAgentColors, pickAgentColor } from './agentColor'

const pane = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'claude' as const,
  generation: 0,
  ...extra,
})

describe('pickAgentColor', () => {
  test('takes the first palette colour no agent uses', () => {
    expect(pickAgentColor([], undefined)).toBe('blue')
    expect(pickAgentColor(['blue', 'orange'], undefined)).toBe('purple')
  })

  test("skips the project's own colour", () => {
    expect(pickAgentColor([], 'blue')).toBe('orange')
  })

  test('repeats colours once every one is taken', () => {
    const allButProject = PROJECT_COLORS.filter((color) => color !== 'teal')
    expect(pickAgentColor(allButProject, 'teal')).not.toBe('teal')
  })
})

describe('assignAgentColors', () => {
  test('gives agents without a colour a free one and leaves the rest alone', () => {
    const panes = [
      pane('a', { color: 'orange' }),
      pane('b'),
      pane('c', { kind: 'shell' }),
      pane('d', { kind: 'codex' }),
    ]

    const result = assignAgentColors(panes, 'blue')

    expect(result.map((p) => p.color)).toEqual(['orange', 'purple', undefined, 'pink'])
  })

  test('returns the same array when nothing changes', () => {
    const panes = [pane('a', { color: 'red' }), pane('b', { kind: 'shell' })]
    expect(assignAgentColors(panes, undefined)).toBe(panes)
  })
})
