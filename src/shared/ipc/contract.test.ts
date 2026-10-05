import { describe, expect, test } from 'vitest'
import {
  terminalCreateRequestSchema,
  terminalResizeRequestSchema,
  terminalWriteRequestSchema,
} from './contract'

describe('terminalCreateRequestSchema', () => {
  const valid = { kind: 'claude', cwd: '/Users/me/repo', cols: 120, rows: 40 }

  test('accepts a valid request', () => {
    expect(terminalCreateRequestSchema.parse(valid)).toEqual(valid)
  })

  test('rejects an unknown terminal kind', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, kind: 'bash' }).success).toBe(false)
  })

  test('rejects a relative cwd', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cwd: 'repo' }).success).toBe(false)
  })

  test('rejects non-integer or out-of-range dimensions', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cols: 0 }).success).toBe(false)
    expect(terminalCreateRequestSchema.safeParse({ ...valid, rows: 1.5 }).success).toBe(false)
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cols: 100_000 }).success).toBe(false)
  })
})

describe('terminalWriteRequestSchema', () => {
  test('accepts terminal input', () => {
    expect(terminalWriteRequestSchema.safeParse({ id: 't1', data: 'ls\r' }).success).toBe(true)
  })

  test('rejects oversized input', () => {
    const data = 'x'.repeat(2 * 1024 * 1024)
    expect(terminalWriteRequestSchema.safeParse({ id: 't1', data }).success).toBe(false)
  })
})

describe('terminalResizeRequestSchema', () => {
  test('requires an id', () => {
    expect(terminalResizeRequestSchema.safeParse({ cols: 80, rows: 24 }).success).toBe(false)
  })
})
