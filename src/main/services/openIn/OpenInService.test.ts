import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { SettingsStore } from '../settings/SettingsStore'
import { OpenInService } from './OpenInService'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'dugout-open-in-'))
}

function setup(installedBundles: readonly string[] = []) {
  const systemApps = makeDir()
  const userApps = makeDir()
  for (const bundle of installedBundles) mkdirSync(join(systemApps, bundle))
  const settings = new SettingsStore({ filePath: join(makeDir(), 'settings.json') })
  const runOpen = vi.fn<(args: readonly string[]) => Promise<void>>(async () => {})
  const service = new OpenInService({
    applicationDirs: [systemApps, join(userApps, 'missing'), userApps],
    runOpen,
    settings,
  })
  return { service, runOpen, settings, userApps }
}

describe('OpenInService.apps', () => {
  test('offers only Finder when no editor is installed', async () => {
    // Arrange
    const { service } = setup()

    // Act
    const apps = await service.apps()

    // Assert
    expect(apps).toEqual({ installed: ['finder'], lastUsed: null })
  })

  test('finds editors in any applications folder, in menu order', async () => {
    // Arrange
    const { service, userApps } = setup(['Zed.app', 'Visual Studio Code.app'])
    mkdirSync(join(userApps, 'Cursor.app'))

    // Act
    const apps = await service.apps()

    // Assert
    expect(apps.installed).toEqual(['vscode', 'cursor', 'zed', 'finder'])
  })

  test('forgets the last choice when that app is gone', async () => {
    // Arrange
    const { service, settings } = setup()
    await settings.update({ openInApp: 'cursor' })

    // Act
    const apps = await service.apps()

    // Assert
    expect(apps.lastUsed).toBeNull()
  })
})

describe('OpenInService.open', () => {
  test('launches the app with the folder as a separate argument and remembers it', async () => {
    // Arrange
    const { service, runOpen } = setup(['Cursor.app'])
    const folder = join(makeDir(), 'my repo; rm -rf ~')
    mkdirSync(folder)

    // Act
    await service.open('cursor', folder)

    // Assert
    expect(runOpen).toHaveBeenCalledWith(['-a', 'Cursor', folder])
    expect(await service.apps()).toEqual({ installed: ['cursor', 'finder'], lastUsed: 'cursor' })
  })

  test('opens Finder by its app name', async () => {
    // Arrange
    const { service, runOpen } = setup()
    const folder = makeDir()

    // Act
    await service.open('finder', folder)

    // Assert
    expect(runOpen).toHaveBeenCalledWith(['-a', 'Finder', folder])
  })

  test('refuses an app that is not installed', async () => {
    // Arrange
    const { service, runOpen } = setup()

    // Act
    const opening = service.open('zed', makeDir())

    // Assert
    await expect(opening).rejects.toThrow('Zed is not installed.')
    expect(runOpen).not.toHaveBeenCalled()
  })

  test('refuses a folder that does not exist or is not absolute', async () => {
    // Arrange
    const { service, runOpen } = setup()

    // Act + Assert
    await expect(service.open('finder', join(makeDir(), 'gone'))).rejects.toThrow(
      'That folder no longer exists.',
    )
    await expect(service.open('finder', 'relative/path')).rejects.toThrow(
      'That folder no longer exists.',
    )
    expect(runOpen).not.toHaveBeenCalled()
  })

  test('reports a launch failure and keeps the previous choice', async () => {
    // Arrange
    const { service, runOpen, settings } = setup(['Zed.app'])
    await settings.update({ openInApp: 'finder' })
    runOpen.mockRejectedValueOnce(new Error('exit 1'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Act
    const opening = service.open('zed', makeDir())

    // Assert
    await expect(opening).rejects.toThrow('Could not open the folder in Zed.')
    expect((await service.apps()).lastUsed).toBe('finder')
    warn.mockRestore()
  })
})
