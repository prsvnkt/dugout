import { describe, expect, test } from 'vitest'
import { idFromFileName, slugify, uniqueId } from './contextIds'

describe('context ids', () => {
  test('slugify keeps letters and digits, joined by dashes', () => {
    expect(slugify('Deploys & releases!')).toBe('deploys-releases')
    expect(slugify('Café au lait')).toBe('cafe-au-lait')
    expect(slugify('!!!')).toBe('note')
  })

  test('uniqueId adds a number until the id is free', () => {
    expect(uniqueId('Deploys', new Set())).toBe('deploys')
    expect(uniqueId('Deploys', new Set(['deploys', 'deploys-2']))).toBe('deploys-3')
  })

  test('idFromFileName accepts markdown files with safe names only', () => {
    expect(idFromFileName('deploys.md')).toBe('deploys')
    expect(idFromFileName('API_notes.v2.md')).toBe('API_notes.v2')
    expect(idFromFileName('notes.txt')).toBeNull()
    expect(idFromFileName('my notes.md')).toBeNull()
    expect(idFromFileName('.hidden.md')).toBeNull()
  })
})
