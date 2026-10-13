import { describe, expect, test } from 'vitest'
import { literalSecrets, type RemoteMcpServer, type StdioMcpServer } from './agentConfig'

function stdio(env: Record<string, string>): StdioMcpServer {
  return { name: 'tool', type: 'stdio', command: 'npx', args: ['tool'], env }
}

function remote(headers: Record<string, string>): RemoteMcpServer {
  return { name: 'api', type: 'http', url: 'https://mcp.example.com', headers }
}

describe('literalSecrets', () => {
  test.each([
    'TOKEN',
    'GITHUB_TOKEN',
    'github_token',
    'CLIENT_SECRET',
    'PASSWORD',
    'DB_PASSWD',
    'API_KEY',
    'api-key',
    'APIKEY',
    'OpenAiApiKey',
    'Authorization',
    'X_AUTH',
  ])('flags %s written out in full', (key) => {
    expect(literalSecrets(stdio({ [key]: 'sk-live-1234' }))).toEqual([key])
  })

  test.each(['NODE_ENV', 'PORT', 'LOG_LEVEL', 'KEYBOARD', 'API_URL', 'PRIVATE_KEY'])(
    'does not flag %s, which does not look like a secret by name',
    (key) => {
      expect(literalSecrets(stdio({ [key]: 'value' }))).toEqual([])
    },
  )

  test('matches "auth" anywhere in the name, so AUTHOR is flagged too', () => {
    expect(literalSecrets(stdio({ GIT_AUTHOR_NAME: 'Ada' }))).toEqual(['GIT_AUTHOR_NAME'])
  })

  test.each(['${API_KEY}', '${API_KEY:-}', '${API_KEY:-dev-default}', '${_KEY_2}'])(
    'accepts the variable reference %s',
    (value) => {
      expect(literalSecrets(stdio({ API_KEY: value }))).toEqual([])
    },
  )

  test('accepts a reference inside a longer value, such as a bearer header', () => {
    expect(literalSecrets(remote({ Authorization: 'Bearer ${GITHUB_TOKEN}' }))).toEqual([])
  })

  test.each(['$API_KEY', '${API_KEY', '{API_KEY}', '${1KEY}', '${API-KEY}', '${API_KEY:+x}'])(
    'flags %s, which is not a ${VAR} or ${VAR:-default} reference',
    (value) => {
      expect(literalSecrets(stdio({ API_KEY: value }))).toEqual(['API_KEY'])
    },
  )

  test.each(['', '   '])('does not flag an empty value %j', (value) => {
    expect(literalSecrets(stdio({ API_KEY: value }))).toEqual([])
  })

  test('checks env for a local server and headers for a remote one', () => {
    const server = remote({ 'X-Api-Key': 'abc', Accept: 'application/json' })

    expect(literalSecrets(server)).toEqual(['X-Api-Key'])
    expect(literalSecrets(stdio({}))).toEqual([])
  })

  test('lists every literal secret, in order', () => {
    const server = stdio({ TOKEN: 'a', PORT: '1', SECRET: '${S}', PASSWORD: 'b' })

    expect(literalSecrets(server)).toEqual(['TOKEN', 'PASSWORD'])
  })
})
