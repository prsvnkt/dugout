import { describe, expect, test } from 'vitest'
import { PROJECT_COLORS, pickProjectColor, suggestProjectName } from './project'

describe('suggestProjectName', () => {
  test('uses the folder name', () => {
    expect(suggestProjectName('/Users/me/code/bene')).toBe('bene')
    expect(suggestProjectName('/Users/me/code/muv/')).toBe('muv')
  })

  test('truncates very long names', () => {
    expect(suggestProjectName(`/x/${'a'.repeat(100)}`)).toHaveLength(60)
  })
})

describe('pickProjectColor', () => {
  test('picks at random among the colours no project uses', () => {
    const used = [{ color: 'blue' as const }, { color: 'orange' as const }]

    expect(pickProjectColor(used, () => 0)).toBe('purple')
    expect(pickProjectColor(used, () => 0.999)).toBe(PROJECT_COLORS.at(-1))
  })

  test('picks any colour once every colour is used', () => {
    const all = PROJECT_COLORS.map((color) => ({ color }))

    expect(pickProjectColor(all, () => 0)).toBe(PROJECT_COLORS[0])
  })
})
