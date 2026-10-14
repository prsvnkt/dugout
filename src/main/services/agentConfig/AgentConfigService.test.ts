import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { AGENTS, type AgentInfo } from '@shared/agents'
import type { AgentAdapter } from '../agents/AgentAdapter'
import { FileService } from '../files/FileService'
import { GitService } from '../git/GitService'
import { AgentConfigService } from './AgentConfigService'

let root: string
const files = new FileService({ git: new GitService({ env: {} }) })
const service = new AgentConfigService(files)
const write = (path: string, text: string) => {
  mkdirSync(join(root, path, '..'), { recursive: true })
  writeFileSync(join(root, path), text)
}
const read = (path: string) => readFileSync(join(root, path), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dugout-agent-config-'))
})

describe('AgentConfigService', () => {
  test('reads servers, sharing per agent and instruction status', async () => {
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
      sharing: {
        old: { claude: { isShared: true }, codex: { isShared: false, reason: expect.any(String) } },
      },
    })
    expect(config.instructions).toEqual({
      hasSharedFile: true,
      ownFiles: [{ kind: 'claude', path: '.claude/CLAUDE.md', importsShared: true }],
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

  test('never copies a CLAUDE.md that links out of the checkout', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'dugout-outside-'))
    writeFileSync(join(outside, 'private.md'), 'secret notes\n')
    symlinkSync(join(outside, 'private.md'), join(root, 'CLAUDE.md'))

    await expect(service.linkInstructions(root)).rejects.toThrow('outside the project')
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    expect(readFileSync(join(outside, 'private.md'), 'utf8')).toBe('secret notes\n')
  })

  test('refuses a .mcp.json that links out of the checkout', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'dugout-outside-'))
    writeFileSync(join(outside, 'servers.json'), '{"mcpServers": {}}')
    symlinkSync(join(outside, 'servers.json'), join(root, '.mcp.json'))

    await expect(service.checkApproval(root, 'hash')).rejects.toThrow('outside the project')
    await expect(service.saveMcp(root, [], 'version')).rejects.toThrow('outside the project')
  })

  test('leaves CLAUDE.md alone when .claude/CLAUDE.md already imports AGENTS.md', async () => {
    write('.claude/CLAUDE.md', '@../AGENTS.md\n')
    write('AGENTS.md', '# Shared\n')
    await service.linkInstructions(root)
    expect(read('.claude/CLAUDE.md')).toBe('@../AGENTS.md\n')
    expect(read('AGENTS.md')).toBe('# Shared\n')
  })
})

/** A made-up agent with its own instructions file and servers passed by Dugout. */
function fakeAdapter(kind: 'claude' | 'codex' | 'opencode', info: Partial<AgentInfo>) {
  const base = AGENTS[kind]
  return {
    info: { ...base, ...info, capabilities: { ...base.capabilities, ...info.capabilities } },
    defaultCommand: kind,
    commandVariable: 'DUGOUT_FAKE_COMMAND',
    launch: () => ({ commandLine: '', env: {} }),
  } satisfies AgentAdapter
}

describe('AgentConfigService with other adapters', () => {
  const adapters: AgentAdapter[] = [
    {
      ...fakeAdapter('claude', { label: 'Alpha', instructionsFiles: ['ALPHA.md'] }),
      instructionsImport: (path) => `include AGENTS.md from ${path}`,
    },
    {
      ...fakeAdapter('codex', {
        label: 'Beta',
        capabilities: { ...AGENTS.codex.capabilities, projectMcp: 'via-dugout' },
      }),
      projectMcpSharing: (server) =>
        server.type === 'stdio' ? { isShared: true } : { isShared: false, reason: 'stdio only' },
    },
    fakeAdapter('opencode', {
      capabilities: { ...AGENTS.opencode.capabilities, projectMcp: 'none' },
    }),
  ]
  const custom = new AgentConfigService(files, adapters)

  test('judges servers and presets with each adapter, leaving out agents that take none', async () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { web: { type: 'http', url: 'https://x' } } }))

    const config = await custom.read(root)

    expect(config.mcp).toMatchObject({
      sharing: {
        web: { claude: { isShared: true }, codex: { isShared: false, reason: 'stdio only' } },
      },
    })
    expect(config.presetSharing.github).toEqual({
      claude: { isShared: true },
      codex: expect.anything(),
    })
    expect(Object.keys(config.presetSharing.github ?? {})).not.toContain('opencode')
  })

  test("links each agent's own file with its own import line and heading", async () => {
    write('ALPHA.md', '# Alpha rules\n')

    expect((await custom.read(root)).instructions).toEqual({
      hasSharedFile: false,
      ownFiles: [{ kind: 'claude', path: 'ALPHA.md', importsShared: false }],
    })
    await custom.linkInstructions(root)

    expect(read('AGENTS.md')).toBe('# Alpha rules\n')
    expect(read('ALPHA.md')).toBe('include AGENTS.md from ALPHA.md\n\n## Alpha-only notes\n')
  })
})
