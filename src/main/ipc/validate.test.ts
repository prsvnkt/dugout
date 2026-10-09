import { afterEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { silenceIpcLogs } from './fakeIpcMain'
import { parsePayload } from './validate'

const schema = z.object({ id: z.string().min(1), count: z.number().int().default(1) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parsePayload', () => {
  test('returns the parsed data, with schema defaults applied, for a valid payload', () => {
    // Arrange
    const payload = { id: 'abc' }

    // Act
    const parsed = parsePayload(schema, payload, 'test:channel')

    // Assert
    expect(parsed).toEqual({ id: 'abc', count: 1 })
  })

  test('strips keys the schema does not know', () => {
    // Arrange
    const payload = { id: 'abc', count: 2, injected: '--upload-pack=evil' }

    // Act
    const parsed = parsePayload(schema, payload, 'test:channel')

    // Assert
    expect(parsed).toEqual({ id: 'abc', count: 2 })
  })

  test('returns null and logs the channel and issues for an invalid payload', () => {
    // Arrange
    const { warn } = silenceIpcLogs()

    // Act
    const parsed = parsePayload(schema, { id: '' }, 'test:channel')

    // Assert
    expect(parsed).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      '[ipc] rejected invalid payload on "test:channel":',
      expect.arrayContaining([expect.objectContaining({ path: ['id'] })]),
    )
  })

  test.each([undefined, null, 'a string', 42, []])(
    'returns null for the non-object payload %j',
    (payload) => {
      // Arrange
      silenceIpcLogs()

      // Act
      const parsed = parsePayload(schema, payload, 'test:channel')

      // Assert
      expect(parsed).toBeNull()
    },
  )

  test('returns null instead of throwing when a refinement fails', () => {
    // Arrange
    silenceIpcLogs()
    const absolute = z.string().refine((path) => path.startsWith('/'))

    // Act
    const parsed = parsePayload(absolute, 'relative/path', 'test:channel')

    // Assert
    expect(parsed).toBeNull()
  })
})
