import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import type { McpServer } from '@shared/agentConfig'
import { readProjectServers, serversHash } from './serverApproval'

const LOCAL: McpServer = {
  name: 'local',
  type: 'stdio',
  command: 'run-local',
  args: ['--port', '3000'],
  env: { MODE: 'ci', TOKEN: '${TOKEN}' },
}
const DOCS: McpServer = {
  name: 'docs',
  type: 'http',
  url: 'https://docs.dev/mcp',
  headers: { 'X-Team': 'a' },
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dugout-approval-'))
})

describe('serversHash', () => {
  test('is the same whatever order the servers and their keys are in', () => {
    const reordered: McpServer = {
      env: { TOKEN: '${TOKEN}', MODE: 'ci' },
      args: ['--port', '3000'],
      command: 'run-local',
      type: 'stdio',
      name: 'local',
    }
    expect(serversHash([LOCAL, DOCS])).toBe(serversHash([DOCS, reordered]))
  })

  test('changes when a command, an argument or its order, or an env value changes', () => {
    const hash = serversHash([LOCAL])
    expect(serversHash([{ ...LOCAL, command: 'sh' }])).not.toBe(hash)
    expect(serversHash([{ ...LOCAL, args: ['3000', '--port'] }])).not.toBe(hash)
    expect(serversHash([{ ...LOCAL, env: { ...LOCAL.env, MODE: 'dev' } }])).not.toBe(hash)
    expect(serversHash([LOCAL, DOCS])).not.toBe(hash)
  })

  test('is a sha256 hex digest', () => {
    expect(serversHash([])).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('readProjectServers', () => {
  test('ignores whitespace and key order in .mcp.json', () => {
    writeFileSync(
      join(root, '.mcp.json'),
      '{"mcpServers":{"local":{"command":"run-local","args":["--port","3000"],' +
        '"env":{"MODE":"ci","TOKEN":"${TOKEN}"}}}}',
    )
    const compact = readProjectServers(root)
    writeFileSync(
      join(root, '.mcp.json'),
      '{\n  "mcpServers": {\n    "local": {\n      "env": { "TOKEN": "${TOKEN}", "MODE": "ci" },\n' +
        '      "args": [ "--port", "3000" ],\n      "command": "run-local"\n    }\n  }\n}\n',
    )
    expect(readProjectServers(root)?.hash).toBe(compact?.hash)
    expect(compact?.servers).toEqual([LOCAL])
  })

  test('is null without a readable .mcp.json', () => {
    expect(readProjectServers(root)).toBeNull()
    writeFileSync(join(root, '.mcp.json'), '{ nope')
    expect(readProjectServers(root)).toBeNull()
  })
})
