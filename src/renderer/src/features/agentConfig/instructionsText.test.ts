import { describe, expect, test } from 'vitest'
import { AGENTS } from '@shared/agents'
import { instructionsText } from './instructionsText'

const own = (path: string | null, importsShared = false) => ({
  kind: 'claude' as const,
  path,
  importsShared,
})

describe('instructionsText', () => {
  test('says when every own file imports AGENTS.md', () => {
    const text = instructionsText({ hasSharedFile: true, ownFiles: [own('CLAUDE.md', true)] })
    expect(text).toEqual({
      isLinked: true,
      text: 'CLAUDE.md imports AGENTS.md, so every agent follows the same instructions.',
    })
  })

  test('explains which agent reads which file, and what linking does', () => {
    const text = instructionsText({ hasSharedFile: false, ownFiles: [own('.claude/CLAUDE.md')] })
    expect(text).toEqual({
      isLinked: false,
      text:
        'Codex and OpenCode read AGENTS.md; Claude reads .claude/CLAUDE.md. Make AGENTS.md the ' +
        'single source and have .claude/CLAUDE.md import it, keeping a section for Claude-only ' +
        'notes. The current .claude/CLAUDE.md becomes AGENTS.md.',
    })
  })

  test("names an agent's preferred file when it has none yet", () => {
    const { text } = instructionsText({ hasSharedFile: true, ownFiles: [own(null)] })
    expect(text).toContain('Claude reads CLAUDE.md.')
    expect(text).not.toContain('becomes AGENTS.md')
  })

  test('follows the agents it is given', () => {
    const single = [AGENTS.codex]
    expect(instructionsText({ hasSharedFile: true, ownFiles: [] }, single)).toEqual({
      isLinked: true,
      text: 'Every agent reads AGENTS.md.',
    })
    const { text } = instructionsText({ hasSharedFile: true, ownFiles: [own(null)] }, single)
    expect(text.startsWith('Codex reads AGENTS.md; Claude reads CLAUDE.md.')).toBe(true)
  })
})
