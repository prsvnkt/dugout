import { describe, expect, test } from 'vitest'
import { AGENT_ADAPTERS } from './services/agents/registry'
import { describeOverrides, readOverrides } from './devOverrides'

const LOCAL_URL = 'http://127.0.0.1:4321'

/** Every override set, with values that pass validation. */
const ALL_ENV = {
  DUGOUT_USER_DATA_DIR: '/tmp/data',
  DUGOUT_HOME_DIR: '/tmp/home',
  DUGOUT_OPEN_COMMAND: '/tmp/fake-open',
  DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1',
  DUGOUT_GITHUB_BASE_URL: `${LOCAL_URL}/`,
  DUGOUT_GITHUB_CLIENT_ID: 'stub-client',
  DUGOUT_LINEAR_BASE_URL: 'http://localhost:9000',
  DUGOUT_CLAUDE_COMMAND: '/tmp/fake-claude',
  DUGOUT_CODEX_COMMAND: '/tmp/fake-codex',
  DUGOUT_OPENCODE_COMMAND: '/tmp/fake-opencode',
  ELECTRON_RENDERER_URL: 'http://localhost:5173',
}

describe('readOverrides', () => {
  test('honours every override in an unpackaged (dev) run', () => {
    const overrides = readOverrides(ALL_ENV, { isPackaged: false })

    expect(overrides).toEqual({
      userDataDir: '/tmp/data',
      homeDir: '/tmp/home',
      openCommand: '/tmp/fake-open',
      insecureTokenStorage: true,
      githubBaseUrl: LOCAL_URL,
      githubClientId: 'stub-client',
      linearBaseUrl: 'http://localhost:9000',
      agentCommands: {
        claude: '/tmp/fake-claude',
        codex: '/tmp/fake-codex',
        opencode: '/tmp/fake-opencode',
      },
      rendererUrl: 'http://localhost:5173',
      active: Object.keys(ALL_ENV).sort(),
      rejected: [],
    })
    expect(Object.isFrozen(overrides)).toBe(true)
  })

  test('returns no overrides when nothing is set', () => {
    const overrides = readOverrides({}, { isPackaged: false })

    expect(overrides.insecureTokenStorage).toBe(false)
    expect(overrides.agentCommands).toEqual({})
    expect(overrides.active).toEqual([])
    expect(overrides.githubBaseUrl).toBeUndefined()
  })

  test('ignores every override in a packaged run without DUGOUT_E2E', () => {
    const overrides = readOverrides(ALL_ENV, { isPackaged: true })

    expect(overrides).toEqual({
      insecureTokenStorage: false,
      agentCommands: {},
      active: [],
      rejected: Object.keys(ALL_ENV).sort(),
    })
  })

  test('ignores overrides when DUGOUT_E2E is anything but "1"', () => {
    const overrides = readOverrides({ ...ALL_ENV, DUGOUT_E2E: 'true' }, { isPackaged: true })

    expect(overrides.active).toEqual([])
  })

  test('honours overrides in a packaged run with DUGOUT_E2E=1, except the renderer URL', () => {
    const overrides = readOverrides({ ...ALL_ENV, DUGOUT_E2E: '1' }, { isPackaged: true })

    expect(overrides.userDataDir).toBe('/tmp/data')
    expect(overrides.insecureTokenStorage).toBe(true)
    expect(overrides.githubBaseUrl).toBe(LOCAL_URL)
    expect(overrides.agentCommands.claude).toBe('/tmp/fake-claude')
    expect(overrides.rendererUrl).toBeUndefined()
    expect(overrides.rejected).toEqual(['ELECTRON_RENDERER_URL'])
  })

  test.each(['http://evil', 'http://10.0.0.1', 'http://evil.com:4321', 'ftp://127.0.0.1', 'nope'])(
    'rejects base URL %s',
    (url) => {
      const env = { DUGOUT_E2E: '1', DUGOUT_GITHUB_BASE_URL: url, DUGOUT_LINEAR_BASE_URL: url }

      for (const isPackaged of [true, false]) {
        const overrides = readOverrides(env, { isPackaged })
        expect(overrides.githubBaseUrl).toBeUndefined()
        expect(overrides.linearBaseUrl).toBeUndefined()
        expect(overrides.rejected).toEqual(['DUGOUT_GITHUB_BASE_URL', 'DUGOUT_LINEAR_BASE_URL'])
      }
    },
  )

  test('rejects base URLs that carry credentials', () => {
    const env = { DUGOUT_GITHUB_BASE_URL: 'https://user:pass@example.com' }

    expect(readOverrides(env, { isPackaged: false }).githubBaseUrl).toBeUndefined()
  })

  test.each([LOCAL_URL, 'http://localhost:4321'])(
    'accepts loopback base URL %s in packaged and dev runs',
    (url) => {
      const env = { DUGOUT_E2E: '1', DUGOUT_GITHUB_BASE_URL: url }

      expect(readOverrides(env, { isPackaged: true }).githubBaseUrl).toBe(url)
      expect(readOverrides(env, { isPackaged: false }).githubBaseUrl).toBe(url)
    },
  )

  test('accepts an https base URL in a dev run (e.g. GitHub Enterprise)', () => {
    const env = { DUGOUT_GITHUB_BASE_URL: 'https://ghe.example.com' }

    expect(readOverrides(env, { isPackaged: false }).githubBaseUrl).toBe('https://ghe.example.com')
  })

  test('rejects https base URLs in a packaged run, even with DUGOUT_E2E=1', () => {
    const env = {
      DUGOUT_E2E: '1',
      DUGOUT_GITHUB_BASE_URL: 'https://ghe.example.com',
      DUGOUT_LINEAR_BASE_URL: 'https://attacker.example',
    }

    const overrides = readOverrides(env, { isPackaged: true })

    expect(overrides.githubBaseUrl).toBeUndefined()
    expect(overrides.linearBaseUrl).toBeUndefined()
    expect(overrides.rejected).toEqual(['DUGOUT_GITHUB_BASE_URL', 'DUGOUT_LINEAR_BASE_URL'])
    expect(describeOverrides(overrides)).toContain(
      'ignored: DUGOUT_GITHUB_BASE_URL, DUGOUT_LINEAR_BASE_URL',
    )
  })

  test('reads each agent command from its adapter variable', () => {
    for (const adapter of Object.values(AGENT_ADAPTERS)) {
      const env = { [adapter.commandVariable]: '/opt/fake' }
      const overrides = readOverrides(env, { isPackaged: false })
      expect(overrides.agentCommands).toEqual({ [adapter.info.kind]: '/opt/fake' })
    }
  })

  test('treats empty strings as unset, except the GitHub client id', () => {
    const env = { DUGOUT_USER_DATA_DIR: '', DUGOUT_GITHUB_CLIENT_ID: '' }
    const overrides = readOverrides(env, { isPackaged: false })

    expect(overrides.userDataDir).toBeUndefined()
    expect(overrides.githubClientId).toBe('')
    expect(overrides.active).toEqual(['DUGOUT_GITHUB_CLIENT_ID'])
  })
})

describe('describeOverrides', () => {
  test('says nothing when no override is set', () => {
    expect(describeOverrides(readOverrides({}, { isPackaged: true }))).toBeUndefined()
  })

  test('names the active and the ignored overrides on one line', () => {
    const env = { DUGOUT_HOME_DIR: '/tmp/home', DUGOUT_GITHUB_BASE_URL: 'http://evil' }

    const line = describeOverrides(readOverrides(env, { isPackaged: false }))

    expect(line).toBe(
      '[dugout] dev/test environment overrides active: DUGOUT_HOME_DIR; ' +
        'ignored: DUGOUT_GITHUB_BASE_URL (decision 060)',
    )
  })

  test('spells out plaintext token storage', () => {
    const env = { DUGOUT_E2E: '1', DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1' }

    const line = describeOverrides(readOverrides(env, { isPackaged: true }))

    expect(line).toContain('PLAINTEXT TOKEN STORAGE (not Keychain)')
  })
})
