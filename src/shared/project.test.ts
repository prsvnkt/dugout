import { describe, expect, test } from 'vitest'
import { PROJECT_COLORS, nextProjectColor, suggestProjectName } from './project'

describe('suggestProjectName', () => {
  test('uses the folder name', () => {
    expect(suggestProjectName('/Users/me/code/bene')).toBe('bene')
    expect(suggestProjectName('/Users/me/code/muv/')).toBe('muv')
  })

  test('truncates very long names', () => {
    expect(suggestProjectName(`/x/${'a'.repeat(100)}`)).toHaveLength(60)
  })
})

describe('nextProjectColor', () => {
  test('starts with blue', () => {
    expect(nextProjectColor([])).toBe('blue')
  })

  test('picks the first unused colour', () => {
    expect(nextProjectColor([{ color: 'blue' }, { color: 'purple' }])).toBe('orange')
  })

  test('offers the greens last, so new projects stand out from the field-green accent', () => {
    expect(PROJECT_COLORS.slice(-2)).toEqual(['teal', 'green'])
  })

  test('cycles once every colour is used', () => {
    const all = PROJECT_COLORS.map((color) => ({ color }))
    expect(PROJECT_COLORS).toContain(nextProjectColor(all))
  })
})
