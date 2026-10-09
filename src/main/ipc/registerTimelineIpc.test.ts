import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { TimelineService } from '../services/timeline/TimelineService'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { registerTimelineIpc } from './registerTimelineIpc'

const SESSION_ID = '3f2a6c1e-8f5b-4c6d-9a7e-1b2c3d4e5f60'

function setup() {
  const timeline = vi.fn(async () => ({ steps: [] }))
  const ipc = new FakeIpcMain()
  registerTimelineIpc({ timeline } as unknown as Pick<TimelineService, 'timeline'>, ipc)
  return { ipc, timeline }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerTimelineIpc', () => {
  test('registers the timeline channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.timelineSession])
  })

  test("returns the session's timeline", async () => {
    // Arrange
    const { ipc, timeline } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.timelineSession, {
      agent: 'claude',
      sessionId: SESSION_ID,
    })

    // Assert
    expect(timeline).toHaveBeenCalledWith('claude', SESSION_ID)
    expect(result).toEqual({ ok: true, data: { steps: [] } })
  })

  test.each([
    { agent: 'claude', sessionId: '../../.ssh/id_rsa' },
    { agent: 'claude', sessionId: '--resume' },
    { agent: 'gpt', sessionId: SESSION_ID },
  ])('rejects the invalid request %j', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, timeline } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.timelineSession, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(timeline).not.toHaveBeenCalled()
  })
})
