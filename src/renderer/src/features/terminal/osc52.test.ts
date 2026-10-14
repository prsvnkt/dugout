import { describe, expect, test } from 'vitest'
import { MAX_OSC52_BASE64_LENGTH, parseOsc52Copy } from './osc52'

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

describe('parseOsc52Copy', () => {
  test('decodes an ASCII copy to the clipboard', () => {
    // Arrange
    const payload = `c;${base64('hello')}`

    // Act
    const text = parseOsc52Copy(payload)

    // Assert
    expect(text).toBe('hello')
  })

  test('decodes multi-byte UTF-8, including emoji', () => {
    // Arrange
    const payload = `c;${base64('héllo — 世界 🚀\nline two')}`

    // Act
    const text = parseOsc52Copy(payload)

    // Assert
    expect(text).toBe('héllo — 世界 🚀\nline two')
  })

  test('accepts an empty selector, which means the default clipboard', () => {
    // Arrange
    const payload = `;${base64('data')}`

    // Act
    const text = parseOsc52Copy(payload)

    // Assert
    expect(text).toBe('data')
  })

  test('accepts several selectors at once', () => {
    expect(parseOsc52Copy(`pc;${base64('both')}`)).toBe('both')
  })

  test('ignores a read request, so a program can never read the clipboard', () => {
    expect(parseOsc52Copy('c;?')).toBeNull()
  })

  test('ignores a clear request with no data', () => {
    expect(parseOsc52Copy('c;')).toBeNull()
  })

  test('ignores a payload without the selector separator', () => {
    expect(parseOsc52Copy(base64('hello'))).toBeNull()
  })

  test.each(['not base64!', 'aGVsbG8', 'aGV$bG8=', '===='])('ignores invalid base64 %j', (data) => {
    expect(parseOsc52Copy(`c;${data}`)).toBeNull()
  })

  test('ignores bytes that are not valid UTF-8', () => {
    // Arrange: a lone continuation byte
    const payload = `c;${bytesToBase64(new Uint8Array([0x80]))}`

    // Act
    const text = parseOsc52Copy(payload)

    // Assert
    expect(text).toBeNull()
  })

  test('ignores a payload over the size cap', () => {
    // Arrange
    const data = 'A'.repeat(MAX_OSC52_BASE64_LENGTH + 4)

    // Act
    const text = parseOsc52Copy(`c;${data}`)

    // Assert
    expect(text).toBeNull()
  })

  test('accepts a payload right at the size cap', () => {
    // Arrange
    const data = 'A'.repeat(MAX_OSC52_BASE64_LENGTH)

    // Act
    const text = parseOsc52Copy(`c;${data}`)

    // Assert
    expect(text).toHaveLength((MAX_OSC52_BASE64_LENGTH / 4) * 3)
  })
})
