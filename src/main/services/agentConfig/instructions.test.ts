import { describe, expect, test } from 'vitest'
import { importsShared, linkInstructions } from './instructions'

const LINK = { importLine: '@AGENTS.md', heading: '## Claude-only notes' } as const

describe('importsShared', () => {
  test('finds the import as a line of its own', () => {
    expect(importsShared('# Notes\n@AGENTS.md\n', '@AGENTS.md')).toBe(true)
    expect(importsShared('  @../AGENTS.md  \r\n', '@../AGENTS.md')).toBe(true)
    expect(importsShared('See @AGENTS.md for more\n', '@AGENTS.md')).toBe(false)
  })
})

describe('linkInstructions', () => {
  test('moves the own file into a new AGENTS.md and leaves an import plus an own-notes section', () => {
    const result = linkInstructions({ ...LINK, shared: null, own: '# Rules\nUse pnpm.\n' })
    expect(result.shared).toBe('# Rules\nUse pnpm.\n')
    expect(result.own).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  })

  test('adds the import above existing content when AGENTS.md already exists', () => {
    const result = linkInstructions({
      importLine: '@../AGENTS.md',
      heading: '## Claude-only notes',
      shared: '# Shared\n',
      own: '# Claude\n',
    })
    expect(result).toEqual({ shared: '# Shared\n', own: '@../AGENTS.md\n\n# Claude\n' })
  })

  test('creates both files for a project with neither', () => {
    const result = linkInstructions({ ...LINK, shared: null, own: null })
    expect(result.shared).toBe('# Agent instructions\n')
    expect(result.own).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  })

  test('only adds the import to an empty own file next to AGENTS.md', () => {
    const result = linkInstructions({ ...LINK, shared: '# Shared\n', own: '' })
    expect(result).toEqual({ shared: '# Shared\n', own: '@AGENTS.md\n' })
  })

  test('changes nothing when the own file already imports AGENTS.md', () => {
    const input = { ...LINK, shared: '# Shared\n', own: '@AGENTS.md\n' }
    expect(linkInstructions(input)).toEqual({ shared: '# Shared\n', own: '@AGENTS.md\n' })
  })
})
