import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { LayoutStore } from '../services/workspace/LayoutStore'
import { FakeIpcMain, PROJECT_ID, fakeProjects, silenceIpcLogs, testProject } from './fakeIpcMain'
import { registerWorkspaceIpc } from './registerWorkspaceIpc'

const SNAPSHOT = { version: 1, projects: { [PROJECT_ID]: { panes: [{ kind: 'shell' }] } } }

function setup() {
  const layouts = {
    load: vi.fn(async () => SNAPSHOT),
    save: vi.fn(async () => {}),
  }
  const ipc = new FakeIpcMain()
  registerWorkspaceIpc(
    layouts as unknown as LayoutStore,
    fakeProjects([testProject(), testProject({ id: 'p2' })]),
    ipc,
  )
  return { ipc, layouts }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerWorkspaceIpc', () => {
  test('registers the workspace channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.workspaceLoad, IpcChannel.workspaceSave].sort())
  })

  test('loads the layout for the projects that still exist', async () => {
    // Arrange
    const { ipc, layouts } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.workspaceLoad)

    // Assert
    expect(layouts.load).toHaveBeenCalledWith([PROJECT_ID, 'p2'])
    expect(result).toEqual({ ok: true, data: SNAPSHOT })
  })

  test('saves a valid snapshot', async () => {
    // Arrange
    const { ipc, layouts } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.workspaceSave, SNAPSHOT)

    // Assert
    expect(layouts.save).toHaveBeenCalledWith(SNAPSHOT)
    expect(result).toEqual({ ok: true, data: undefined })
  })

  test.each([
    { version: 2, projects: {} },
    { version: 1, projects: { [PROJECT_ID]: { panes: [{ kind: 'rm -rf' }] } } },
  ])('refuses to save the invalid snapshot %j', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, layouts } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.workspaceSave, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(layouts.save).not.toHaveBeenCalled()
  })
})
