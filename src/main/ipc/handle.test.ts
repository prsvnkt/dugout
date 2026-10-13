import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { handleRequest } from './handle'

const CHANNEL = 'test:echo'
const schema = z.object({ name: z.string().min(1) })

afterEach(() => {
  vi.restoreAllMocks()
})

function register(handler: (request: { name: string }) => unknown) {
  const ipc = new FakeIpcMain()
  handleRequest(CHANNEL, schema, handler, ipc)
  return ipc
}

describe('handleRequest', () => {
  test('registers the handler on the given channel', () => {
    // Arrange / Act
    const ipc = register(() => null)

    // Assert
    expect(ipc.channels()).toEqual([CHANNEL])
  })

  test('wraps the handler result in ok', async () => {
    // Arrange
    const ipc = register(({ name }) => `hello ${name}`)

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: true, data: 'hello Ada' })
  })

  test('awaits an async handler', async () => {
    // Arrange
    const ipc = register(async ({ name }) => ({ greeted: name }))

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: true, data: { greeted: 'Ada' } })
  })

  test('passes the parsed payload, not the raw one, to the handler', async () => {
    // Arrange
    const handler = vi.fn(() => null)
    const ipc = register(handler)

    // Act
    await ipc.invoke(CHANNEL, { name: 'Ada', extra: 'dropped by zod' })

    // Assert
    expect(handler).toHaveBeenCalledWith({ name: 'Ada' }, expect.anything())
  })

  test('rejects an invalid payload with "Invalid request." without calling the handler', async () => {
    // Arrange
    const { warn } = silenceIpcLogs()
    const handler = vi.fn(() => null)
    const ipc = register(handler)

    // Act
    const result = await ipc.invoke(CHANNEL, { name: '' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(handler).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"${CHANNEL}"`), expect.any(Array))
  })

  test('turns a thrown Error into fail(message) and logs it', async () => {
    // Arrange
    const { error: logError } = silenceIpcLogs()
    const failure = new Error('Project not found.')
    const ipc = register(() => {
      throw failure
    })

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(logError).toHaveBeenCalledWith(`[ipc] "${CHANNEL}" failed:`, failure)
  })

  test('turns a rejected promise into fail(message)', async () => {
    // Arrange
    silenceIpcLogs()
    const ipc = register(async () => Promise.reject(new Error('git failed')))

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'git failed' })
  })

  test('uses a generic message when the handler throws something that is not an Error', async () => {
    // Arrange
    silenceIpcLogs()
    const ipc = register(() => {
      throw 'a bare string'
    })

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Something went wrong.' })
  })

  test('never puts the stack trace in the result', async () => {
    // Arrange
    silenceIpcLogs()
    const ipc = register(() => {
      throw new Error('boom')
    })

    // Act
    const result = await ipc.invoke(CHANNEL, { name: 'Ada' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'boom' })
    expect(JSON.stringify(result)).not.toMatch(/\bat\s|handle\.test\.ts|stack/)
  })
})
