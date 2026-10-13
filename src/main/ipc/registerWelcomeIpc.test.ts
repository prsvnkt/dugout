import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { SettingsStore } from '../services/settings/SettingsStore'
import type { ShellRunner } from '../services/welcome/checkAgentClis'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { registerWelcomeIpc } from './registerWelcomeIpc'

const AGENT_COMMANDS = { claude: 'claude', codex: 'codex', opencode: 'opencode' }

function setup(cloneParentDir?: string) {
  const homeDir = mkdtempSync(join(tmpdir(), 'dugout-welcome-home-'))
  const settings = { load: vi.fn(async () => ({ cloneParentDir })) }
  const runInLoginShell = vi.fn<ShellRunner>(async (_line, env) =>
    env.DUGOUT_CHECK_COMMAND === 'claude'
      ? { kind: 'exited', exitCode: 0, stdout: '/usr/local/bin/claude\n' }
      : { kind: 'exited', exitCode: 1, stdout: '' },
  )
  const ipc = new FakeIpcMain()
  registerWelcomeIpc(
    {
      settings: settings as unknown as SettingsStore,
      homeDir,
      runInLoginShell,
      agentCommands: AGENT_COMMANDS,
    },
    ipc,
  )
  return { ipc, homeDir, settings, runInLoginShell }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerWelcomeIpc', () => {
  test('registers the first-run channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [IpcChannel.welcomeFindRepos, IpcChannel.welcomeCheckAgents].sort(),
    )
  })

  test('finds repositories in the clone folder', async () => {
    // Arrange
    const cloneParent = mkdtempSync(join(tmpdir(), 'dugout-welcome-clones-'))
    mkdirSync(join(cloneParent, 'demo', '.git'), { recursive: true })
    const { ipc } = setup(cloneParent)

    // Act
    const result = await ipc.invoke<{ path: string }[]>(IpcChannel.welcomeFindRepos, 'common')

    // Assert
    expect(result.ok && result.data.map((repo) => repo.path)).toEqual([join(cloneParent, 'demo')])
  })

  test('searches only under the injected home folder', async () => {
    // Arrange
    const { ipc, homeDir } = setup()
    mkdirSync(join(homeDir, 'Documents', 'notes', '.git'), { recursive: true })

    // Act
    const result = await ipc.invoke<{ path: string }[]>(IpcChannel.welcomeFindRepos, 'documents')

    // Assert
    expect(result.ok && result.data.map((repo) => repo.path)).toEqual([
      join(homeDir, 'Documents', 'notes'),
    ])
  })

  test('rejects an unknown search scope', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, settings } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.welcomeFindRepos, '/')

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(settings.load).not.toHaveBeenCalled()
  })

  test("checks each agent's command in the login shell", async () => {
    // Arrange
    const { ipc, runInLoginShell } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.welcomeCheckAgents)

    // Assert
    expect(runInLoginShell).toHaveBeenCalledTimes(3)
    expect(result).toEqual({
      ok: true,
      data: {
        claude: { state: 'installed', path: '/usr/local/bin/claude' },
        codex: { state: 'missing' },
        opencode: { state: 'missing' },
      },
    })
  })
})
