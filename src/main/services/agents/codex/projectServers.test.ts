import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { codexProjectServerOverrides } from './projectServers'

let root: string
const write = (path: string, text: string) => writeFileSync(join(root, path), text)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dugout-codex-servers-'))
})

describe('codexProjectServerOverrides', () => {
  test("turns the checkout's shareable servers into -c overrides", () => {
    write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          docs: { type: 'http', url: 'https://docs.dev/mcp' },
          old: { type: 'sse', url: 'https://x.dev/sse' },
        },
      }),
    )
    expect(codexProjectServerOverrides(root)).toEqual([
      'mcp_servers.docs={ url = "https://docs.dev/mcp" }',
    ])
  })

  test('is empty without a readable .mcp.json', () => {
    expect(codexProjectServerOverrides(root)).toEqual([])
    write('.mcp.json', 'nope')
    expect(codexProjectServerOverrides(root)).toEqual([])
  })
})
