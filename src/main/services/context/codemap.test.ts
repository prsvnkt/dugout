import { describe, expect, test, vi } from 'vitest'
import { AGENT_ADAPTERS, agentAdapter } from '../agents/registry'
import type { HeadlessRunner } from '../agents/runHeadless'
import { buildCodemap, CODEMAP_PROMPT } from './codemap'

const COMMANDS = { claude: '/fake/claude', codex: '/fake/codex', opencode: '/fake/opencode' }

describe('buildCodemap', () => {
  test("runs the agent's headless mode in the project and keeps its Markdown", async () => {
    const run = vi.fn<HeadlessRunner>(async () => '\n# Codemap\n- src/\n\n')

    const markdown = await buildCodemap(
      { adapter: agentAdapter, commands: COMMANDS, run },
      'claude',
      '/repo',
    )

    expect(markdown).toBe('# Codemap\n- src/')
    expect(run).toHaveBeenCalledWith(
      AGENT_ADAPTERS.claude.headless?.('/fake/claude'),
      '/repo',
      CODEMAP_PROMPT,
    )
  })

  test('refuses agents without a headless mode, and empty answers', async () => {
    const run = vi.fn<HeadlessRunner>(async () => '  ')
    const deps = { adapter: agentAdapter, commands: COMMANDS, run }
    await expect(buildCodemap(deps, 'codex', '/repo')).rejects.toThrow('cannot build')
    await expect(buildCodemap(deps, 'claude', '/repo')).rejects.toThrow('empty')
  })
})
