import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { readProjectServers } from '../../agentConfig/serverApproval'
import { launchContext, MCP_ENTRY, memoryFiles } from '../testContext'
import { codexAdapter } from './codexAdapter'
import { codexConfigOverrides } from './codexConfig'

const withMcp = () => ({ mcp: { server: MCP_ENTRY, files: memoryFiles() } })

function checkoutWithDocsServer(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'dugout-codex-'))
  writeFileSync(
    join(cwd, '.mcp.json'),
    JSON.stringify({ mcpServers: { docs: { type: 'http', url: 'https://docs.dev/mcp' } } }),
  )
  return cwd
}

describe('codexAdapter', () => {
  test('starts Codex with its config overrides and first prompt', () => {
    const launch = codexAdapter.launch(launchContext({ hasInitialPrompt: true, ...withMcp() }))
    const count = codexConfigOverrides(MCP_ENTRY).length
    const overrides = Array.from({ length: count }, (_, i) => ` -c "$DUGOUT_CODEX_C${i}"`).join('')
    expect(launch.commandLine).toBe(`"$DUGOUT_CODEX_COMMAND" "$DUGOUT_INITIAL_PROMPT"${overrides}`)
  })

  test('resumes Codex with its resume subcommand', () => {
    const launch = codexAdapter.launch(launchContext({ isResuming: true, ...withMcp() }))
    expect(launch.commandLine).toMatch(
      /^"\$DUGOUT_CODEX_COMMAND" resume "\$DUGOUT_RESUME_SESSION" -c "\$DUGOUT_CODEX_C0"/,
    )
  })

  test('passes each override in its own variable: hooks, the dugout server, then approved project servers', () => {
    const cwd = checkoutWithDocsServer()
    const approvedProjectServers = readProjectServers(cwd)?.hash
    const launch = codexAdapter.launch(launchContext({ cwd, approvedProjectServers, ...withMcp() }))

    const expected = [
      ...codexConfigOverrides(MCP_ENTRY),
      'mcp_servers.docs={ url = "https://docs.dev/mcp" }',
    ]
    expect(launch.env).toEqual({
      DUGOUT_CODEX_COMMAND: '/opt/fake/agent',
      ...Object.fromEntries(expected.map((value, i) => [`DUGOUT_CODEX_C${i}`, value])),
    })
    expect(launch.withheldServers).toBeUndefined()
  })

  test('leaves unapproved project servers out, and reports them as withheld', () => {
    const cwd = checkoutWithDocsServer()
    const launch = codexAdapter.launch(launchContext({ cwd, ...withMcp() }))

    expect(Object.values(launch.env).filter((value) => value.startsWith('mcp_servers.'))).toEqual([
      expect.stringMatching(/^mcp_servers\.dugout=/),
    ])
    expect(launch.withheldServers).toEqual({
      servers: [{ name: 'docs', type: 'http', url: 'https://docs.dev/mcp', headers: {} }],
      hash: readProjectServers(cwd)?.hash,
    })
  })

  test('without the task server it gets no overrides, as before adapters', () => {
    const launch = codexAdapter.launch(launchContext())
    expect(launch.commandLine).toBe('"$DUGOUT_CODEX_COMMAND"')
    expect(launch.env).toEqual({ DUGOUT_CODEX_COMMAND: '/opt/fake/agent' })
  })
})
