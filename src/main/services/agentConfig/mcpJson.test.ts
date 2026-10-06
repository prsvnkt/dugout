import { describe, expect, test } from 'vitest'
import { parseMcpJson, serializeMcpJson } from './mcpJson'

const FILE = JSON.stringify({
  mcpServers: {
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      timeout: 30,
    },
    docs: { type: 'http', url: 'https://docs.example.com/mcp', headers: { 'X-Team': 'a' } },
  },
  $schema: 'https://example.com/schema.json',
})

describe('parseMcpJson', () => {
  test('reads stdio and http servers', () => {
    const { servers } = parseMcpJson(FILE)
    expect(servers).toEqual([
      {
        name: 'github',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      },
      {
        name: 'docs',
        type: 'http',
        url: 'https://docs.example.com/mcp',
        headers: { 'X-Team': 'a' },
      },
    ])
  })

  test('treats a missing file as no servers', () => {
    expect(parseMcpJson(null).servers).toEqual([])
  })

  test('rejects text that is not a JSON object with readable servers', () => {
    expect(() => parseMcpJson('{ nope')).toThrow(/not valid JSON/)
    expect(() => parseMcpJson('{"mcpServers": {"x": {"type": "stdio"}}}')).toThrow(/x/)
  })
})

describe('serializeMcpJson', () => {
  test('keeps fields Dugout does not edit, on the file and on each server', () => {
    const { raw, servers } = parseMcpJson(FILE)
    const edited = servers.map((server) =>
      server.type === 'stdio' ? { ...server, args: ['server-github'] } : server,
    )
    const written = JSON.parse(serializeMcpJson(raw, edited))
    expect(written.$schema).toBe('https://example.com/schema.json')
    expect(written.mcpServers.github).toEqual({
      command: 'npx',
      args: ['server-github'],
      env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      timeout: 30,
    })
  })

  test('drops removed servers and the old transport fields when a server changes type', () => {
    const { raw } = parseMcpJson(FILE)
    const written = JSON.parse(
      serializeMcpJson(raw, [
        { name: 'github', type: 'http', url: 'https://x.dev/mcp', headers: {} },
      ]),
    )
    expect(Object.keys(written.mcpServers)).toEqual(['github'])
    expect(written.mcpServers.github).toEqual({
      timeout: 30,
      type: 'http',
      url: 'https://x.dev/mcp',
    })
  })

  test('writes a new file with two-space indentation and a final newline', () => {
    const text = serializeMcpJson(null, [
      { name: 'a', type: 'stdio', command: 'a', args: [], env: {} },
    ])
    expect(text).toBe('{\n  "mcpServers": {\n    "a": {\n      "command": "a"\n    }\n  }\n}\n')
  })
})
