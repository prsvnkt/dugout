import { describe, expect, test } from 'vitest'
import { AGENT_LIST, SHARED_INSTRUCTIONS_FILE } from '@shared/agents'

declare global {
  interface ImportMeta {
    /** Vite's glob import (the renderer's tsconfig has no Node or Vite client types). */
    glob<T>(
      patterns: readonly string[],
      options: { readonly query: '?raw'; readonly import: 'default'; readonly eager: true },
    ): Record<string, T>
  }
}

/**
 * "Words on screen" (decision 037): agent names come from `shared/agents.ts`, never from the
 * renderer's own code. This scans every renderer source file, comments removed, for an agent's
 * label, product or CLI name, or an instructions file only one agent reads.
 */
const SOURCES = import.meta.glob<string>(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./**/*.testSupport.ts', '!./**/*.d.ts'],
  { query: '?raw', import: 'default', eager: true },
)

/** The code without comments: block and JSX comments, and `//` comments (not inside URLs). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const NAMES = [
  ...new Set([
    ...AGENT_LIST.flatMap((agent) => [agent.label, agent.productName, agent.cliName]),
    ...AGENT_LIST.flatMap((agent) => agent.instructionsFiles),
  ]),
].filter((name) => name !== SHARED_INSTRUCTIONS_FILE)

const NAME_PATTERN = new RegExp(`(?<![\\w.])(${NAMES.map(escape).join('|')})(?![\\w])`)

describe('renderer text', () => {
  test('finds names when they are there', () => {
    expect(NAME_PATTERN.test("text: 'Claude Code in a terminal'")).toBe(true)
    expect(NAME_PATTERN.test('<p>Open CLAUDE.md</p>')).toBe(true)
    expect(NAME_PATTERN.test('const claudeMdPath = path // Claude reads it')).toBe(true)
    expect(NAME_PATTERN.test(withoutComments('const x = 1 // Claude reads it'))).toBe(false)
    expect(NAME_PATTERN.test(withoutComments("const url = 'https://x.dev/Claude'"))).toBe(true)
  })

  test('covers the renderer', () => {
    expect(Object.keys(SOURCES)).toContain('./features/welcome/WelcomeScreen.tsx')
  })

  test.each(Object.entries(SOURCES))('%s names no agent itself', (_path, source) => {
    expect(NAME_PATTERN.exec(withoutComments(source))?.[0]).toBeUndefined()
  })
})
