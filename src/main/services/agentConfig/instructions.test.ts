import { describe, expect, test } from 'vitest'
import { importsAgentsMd, linkInstructions } from './instructions'

describe('importsAgentsMd', () => {
  test('finds the import line, relative to where CLAUDE.md lives', () => {
    expect(importsAgentsMd('# Notes\n@AGENTS.md\n', 'CLAUDE.md')).toBe(true)
    expect(importsAgentsMd('@../AGENTS.md\n', '.claude/CLAUDE.md')).toBe(true)
    expect(importsAgentsMd('See AGENTS.md for more\n', 'CLAUDE.md')).toBe(false)
  })
})

describe('linkInstructions', () => {
  test('moves CLAUDE.md into a new AGENTS.md and leaves an import plus a Claude-only section', () => {
    const result = linkInstructions({
      agents: null,
      claude: '# Rules\nUse pnpm.\n',
      claudePath: 'CLAUDE.md',
    })
    expect(result.agents).toBe('# Rules\nUse pnpm.\n')
    expect(result.claude).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  })

  test('adds the import above existing CLAUDE.md content when AGENTS.md already exists', () => {
    const result = linkInstructions({
      agents: '# Shared\n',
      claude: '# Claude\n',
      claudePath: '.claude/CLAUDE.md',
    })
    expect(result.agents).toBe('# Shared\n')
    expect(result.claude).toBe('@../AGENTS.md\n\n# Claude\n')
  })

  test('creates both files for a project with neither', () => {
    const result = linkInstructions({ agents: null, claude: null, claudePath: 'CLAUDE.md' })
    expect(result.agents).toBe('# Agent instructions\n')
    expect(result.claude).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  })

  test('changes nothing when CLAUDE.md already imports AGENTS.md', () => {
    const input = { agents: '# Shared\n', claude: '@AGENTS.md\n', claudePath: 'CLAUDE.md' } as const
    expect(linkInstructions(input)).toEqual({ agents: '# Shared\n', claude: '@AGENTS.md\n' })
  })
})
