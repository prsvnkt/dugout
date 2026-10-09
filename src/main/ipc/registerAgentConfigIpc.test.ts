import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { AgentConfigService } from '../services/agentConfig/AgentConfigService'
import { FakeIpcMain, PROJECT_ID, PROJECT_ROOT, fakeProjects, silenceIpcLogs } from './fakeIpcMain'
import { registerAgentConfigIpc } from './registerAgentConfigIpc'

const SERVER = { name: 'docs', type: 'http', url: 'https://mcp.example/docs', headers: {} }

function setup() {
  const agentConfig = {
    read: vi.fn(async () => ({ from: 'read' })),
    saveMcp: vi.fn(async () => ({ from: 'saveMcp' })),
    linkInstructions: vi.fn(async () => ({ from: 'linkInstructions' })),
  }
  const ipc = new FakeIpcMain()
  registerAgentConfigIpc(fakeProjects(), agentConfig as unknown as AgentConfigService, ipc)
  return { ipc, agentConfig }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerAgentConfigIpc', () => {
  test('registers every agent config channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        IpcChannel.agentConfigRead,
        IpcChannel.agentConfigSaveMcp,
        IpcChannel.agentConfigLinkInstructions,
      ].sort(),
    )
  })

  test.each([
    [IpcChannel.agentConfigRead, {}, 'read', []],
    [
      IpcChannel.agentConfigSaveMcp,
      { servers: [SERVER], version: 'v1' },
      'saveMcp',
      [[SERVER], 'v1'],
    ],
    [IpcChannel.agentConfigLinkInstructions, {}, 'linkInstructions', []],
  ] as const)(
    "%s calls agentConfig.%s at the project's main checkout",
    async (channel, payload, method, args) => {
      // Arrange
      const { ipc, agentConfig } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

      // Assert
      expect(result).toEqual({ ok: true, data: { from: method } })
      expect(agentConfig[method]).toHaveBeenCalledWith(PROJECT_ROOT, ...args)
    },
  )

  test('fails for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, agentConfig } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.agentConfigRead, { projectId: 'missing' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(agentConfig.read).not.toHaveBeenCalled()
  })

  test.each([
    { projectId: PROJECT_ID, version: 'v1', servers: [SERVER, SERVER] },
    { projectId: PROJECT_ID, version: 'v1', servers: [{ ...SERVER, url: 'file:///etc/passwd' }] },
    { projectId: PROJECT_ID, servers: [] },
  ])('rejects the invalid MCP save %j', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, agentConfig } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.agentConfigSaveMcp, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(agentConfig.saveMcp).not.toHaveBeenCalled()
  })
})
