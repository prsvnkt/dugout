import { describe, expect, test } from 'vitest'
import { codexMcpServer } from './codexMcp'

describe('codexMcpServer', () => {
  test('passes a stdio server through, forwarding ${VAR} env entries by name', () => {
    expect(
      codexMcpServer({
        name: 'github',
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server-github'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}', MODE: 'ci' },
      }),
    ).toEqual({
      ok: true,
      config: {
        command: 'npx',
        args: ['-y', 'server-github'],
        env: { MODE: 'ci' },
        env_vars: ['GITHUB_TOKEN'],
      },
    })
  })

  test('maps http headers, a Bearer ${VAR} and whole-value ${VAR} headers', () => {
    expect(
      codexMcpServer({
        name: 'docs',
        type: 'http',
        url: 'https://docs.example.com/mcp',
        headers: { Authorization: 'Bearer ${DOCS_TOKEN}', 'X-Team': 'a', 'X-Key': '${DOCS_KEY}' },
      }),
    ).toEqual({
      ok: true,
      config: {
        url: 'https://docs.example.com/mcp',
        bearer_token_env_var: 'DOCS_TOKEN',
        http_headers: { 'X-Team': 'a' },
        env_http_headers: { 'X-Key': 'DOCS_KEY' },
      },
    })
  })

  test('skips what Codex cannot express, with a reason', () => {
    const sse = codexMcpServer({ name: 'old', type: 'sse', url: 'https://x.dev/sse', headers: {} })
    const mixed = codexMcpServer({
      name: 'mixed',
      type: 'stdio',
      command: 'run',
      args: ['--token=${TOKEN}'],
      env: {},
    })
    const renamed = codexMcpServer({
      name: 'r',
      type: 'stdio',
      command: 'run',
      args: [],
      env: { API_KEY: '${OTHER}' },
    })
    expect(sse).toEqual({ ok: false, reason: expect.stringMatching(/SSE/) })
    expect(mixed).toEqual({ ok: false, reason: expect.stringMatching(/\$\{/) })
    expect(renamed).toEqual({ ok: false, reason: expect.stringMatching(/API_KEY/) })
  })

  test('never shares a server named dugout, which is reserved for task tools', () => {
    expect(
      codexMcpServer({ name: 'dugout', type: 'stdio', command: 'x', args: [], env: {} }),
    ).toEqual({ ok: false, reason: expect.stringMatching(/reserved/) })
  })
})
