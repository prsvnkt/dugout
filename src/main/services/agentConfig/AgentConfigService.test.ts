import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { AgentConfigService } from './AgentConfigService'

let root: string
const service = new AgentConfigService()
const write = (path: string, text: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}
const read = (path: string) => readFileSync(join(root, path), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dugout-agent-config-'))
})

describe('AgentConfigService', () => {
  test('reads servers, Codex sharing and instruction status', async () => {
    write(
      '.mcp.json',
      JSON.stringify({ mcpServers: { old: { type: 'sse', url: 'https://x.dev/sse' } } }),
    )
    write('.claude/CLAUDE.md', '@../AGENTS.md\n')
    write('AGENTS.md', '# Shared\n')

    const config = await service.read(root)

    expect(config.mcp).toMatchObject({
      ok: true,
      servers: [{ name: 'old', type: 'sse' }],
      codex: { old: { isShared: false, reason: expect.stringMatching(/SSE/) } },
    })
    expect(config.instructions).toEqual({
      hasAgentsMd: true,
      claudeMdPath: '.claude/CLAUDE.md',
      importsAgentsMd: true,
    })
  })

  test('says whether the servers in the file are the approved ones (decision 057)', async () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { a: { command: 'run-a' } } }))
    const { mcp } = await service.read(root)
    if (!mcp.ok) throw new Error('expected servers')

    expect(mcp.approval).toEqual({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      isApproved: false,
    })
    expect((await service.read(root, mcp.approval.hash)).mcp).toMatchObject({
      approval: { hash: mcp.approval.hash, isApproved: true },
    })
  })

  test('approves only the servers the user saw: refuses once the file changed', async () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { a: { command: 'run-a' } } }))
    const { mcp } = await service.read(root)
    if (!mcp.ok) throw new Error('expected servers')

    await expect(service.checkApproval(root, mcp.approval.hash)).resolves.toBeUndefined()
    write('.mcp.json', JSON.stringify({ mcpServers: { a: { command: 'sh' } } }))
    await expect(service.checkApproval(root, mcp.approval.hash)).rejects.toThrow(/changed on disk/)
  })

  test('reports an unreadable .mcp.json instead of failing', async () => {
    write('.mcp.json', '{ broken')
    expect((await service.read(root)).mcp).toEqual({
      ok: false,
      error: '.mcp.json is not valid JSON.',
    })
  })

  test('saves servers, and refuses when the file changed since it was read', async () => {
    const { mcp } = await service.read(root)
    if (!mcp.ok) throw new Error('expected servers')
    const server = { name: 'a', type: 'stdio', command: 'run-a', args: [], env: {} } as const

    await service.saveMcp(root, [server], mcp.version)
    expect(JSON.parse(read('.mcp.json')).mcpServers.a).toEqual({ command: 'run-a' })

    write('.mcp.json', '{"mcpServers": {}}')
    await expect(service.saveMcp(root, [server], mcp.version)).rejects.toThrow(/changed on disk/)
  })

  test('links CLAUDE.md to a new AGENTS.md', async () => {
    write('CLAUDE.md', '# Rules\n')
    await service.linkInstructions(root)
    expect(read('AGENTS.md')).toBe('# Rules\n')
    expect(read('CLAUDE.md')).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  })
})
