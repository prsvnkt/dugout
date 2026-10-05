import { describe, expect, test } from 'vitest'
import { buildLaunchSpec, buildTerminalEnv, resolveShell } from './launchSpec'

describe('resolveShell', () => {
  test('uses $SHELL when it is an absolute path', () => {
    expect(resolveShell({ SHELL: '/opt/homebrew/bin/fish' })).toBe('/opt/homebrew/bin/fish')
  })

  test('falls back to zsh when $SHELL is missing or relative', () => {
    expect(resolveShell({})).toBe('/bin/zsh')
    expect(resolveShell({ SHELL: 'zsh' })).toBe('/bin/zsh')
  })
})

describe('buildLaunchSpec', () => {
  test('runs claude through an interactive login shell so the user PATH applies', () => {
    expect(buildLaunchSpec('claude', '/bin/zsh')).toEqual({
      file: '/bin/zsh',
      args: ['-l', '-i', '-c', 'claude'],
    })
  })

  test('passes the generated hook settings to claude when hooks are enabled', () => {
    expect(buildLaunchSpec('claude', '/bin/zsh', { hasAgentHooks: true }).args).toEqual([
      '-l',
      '-i',
      '-c',
      '"${DUGOUT_CLAUDE_COMMAND:-claude}" --settings "$DUGOUT_CLAUDE_SETTINGS"',
    ])
  })

  test('starts a plain login shell', () => {
    expect(buildLaunchSpec('shell', '/bin/zsh')).toEqual({ file: '/bin/zsh', args: ['-l'] })
  })
})

describe('buildTerminalEnv', () => {
  test('strips Electron-internal variables', () => {
    const env = buildTerminalEnv({
      PATH: '/usr/bin',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_RENDERER_URL: 'http://localhost',
    })
    expect(env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(env).not.toHaveProperty('ELECTRON_RENDERER_URL')
    expect(env.PATH).toBe('/usr/bin')
  })

  test('strips markers of a parent agent session so each terminal starts fresh', () => {
    const env = buildTerminalEnv({
      HOME: '/Users/me',
      CLAUDECODE: '1',
      CLAUDE_PID: '123',
      CLAUDE_EFFORT: 'medium',
      CLAUDE_CODE_SESSION_ID: 'abc',
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_PLUGIN_DATA: '/tmp',
      AI_AGENT: 'claude',
      CODEX_COMPANION_SESSION_ID: 'x',
    })
    expect(env).toEqual(expect.objectContaining({ HOME: '/Users/me' }))
    expect(Object.keys(env).filter((key) => /CLAUDE|AI_AGENT|CODEX/.test(key))).toEqual([])
  })

  test('does not inherit Dugout variables from the environment that launched the app', () => {
    const env = buildTerminalEnv({ DUGOUT_TERMINAL_ID: 'stale', DUGOUT_USER_DATA_DIR: '/tmp' })
    expect(env).not.toHaveProperty('DUGOUT_TERMINAL_ID')
    expect(env).not.toHaveProperty('DUGOUT_USER_DATA_DIR')
  })

  test('advertises a 256-colour, truecolor terminal', () => {
    const env = buildTerminalEnv({ TERM: 'dumb' })
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.TERM_PROGRAM).toBe('Dugout')
  })

  test('defaults LANG to UTF-8 but keeps a user-provided value', () => {
    expect(buildTerminalEnv({}).LANG).toBe('en_US.UTF-8')
    expect(buildTerminalEnv({ LANG: 'de_DE.UTF-8' }).LANG).toBe('de_DE.UTF-8')
  })

  test('does not mutate the input env', () => {
    const input = { ELECTRON_RUN_AS_NODE: '1' }
    buildTerminalEnv(input)
    expect(input).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
  })

  test('drops undefined values', () => {
    expect(buildTerminalEnv({ EMPTY: undefined })).not.toHaveProperty('EMPTY')
  })
})
