import { describe, expect, test } from 'vitest'
import { fileTypeLabel, formatBytes, formatDuration, viewerFor } from './viewerInfo'

describe('viewerFor', () => {
  test('shows media whatever the text read made of it', () => {
    expect(viewerFor('a.png', { kind: 'binary' })).toBe('image')
    expect(viewerFor('big.mp4', { kind: 'too-large' })).toBe('video')
    expect(viewerFor('icon.svg', { kind: 'text' })).toBe('image')
  })

  test('shows Markdown only when its text was read', () => {
    expect(viewerFor('README.md', { kind: 'text' })).toBe('markdown')
    expect(viewerFor('huge.md', { kind: 'too-large' })).toBeNull()
  })

  test('leaves read errors and other files to the editor', () => {
    expect(viewerFor('a.png', { kind: 'error', message: 'outside the project' })).toBeNull()
    expect(viewerFor('app.ts', { kind: 'text' })).toBeNull()
  })
})

describe('fileTypeLabel', () => {
  test.each([
    ['docs/logo.png', 'image', 'PNG image'],
    ['clip.webm', 'video', 'WEBM video'],
    ['a.b/song.mp3', 'audio', 'MP3 audio'],
    ['paper.pdf', 'pdf', 'PDF document'],
    ['README.md', 'markdown', 'Markdown'],
  ] as const)('%s is a %s file: "%s"', (path, kind, label) => {
    expect(fileTypeLabel(path, kind)).toBe(label)
  })
})

describe('formatBytes', () => {
  test.each([
    [0, '0 bytes'],
    [1, '1 byte'],
    [1023, '1023 bytes'],
    [1536, '1.5 KB'],
    [20 * 1024, '20 KB'],
    [5 * 1024 * 1024, '5.0 MB'],
    [3 * 1024 ** 3, '3.0 GB'],
    [4096 * 1024 ** 3, '4096 GB'],
  ])('%d bytes is "%s"', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })
})

describe('formatDuration', () => {
  test.each([
    [0, '0:00'],
    [65.4, '1:05'],
    [3723, '1:02:03'],
    [Number.NaN, ''],
    [Number.POSITIVE_INFINITY, ''],
  ])('%d seconds is "%s"', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})
