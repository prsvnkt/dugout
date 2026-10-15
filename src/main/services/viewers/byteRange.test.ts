import { describe, expect, test } from 'vitest'
import { parseRange } from './byteRange'

describe('parseRange', () => {
  test.each([
    ['bytes=0-99', { kind: 'partial', start: 0, end: 99 }],
    ['bytes=100-', { kind: 'partial', start: 100, end: 999 }],
    ['bytes=-200', { kind: 'partial', start: 800, end: 999 }],
    ['bytes=-5000', { kind: 'partial', start: 0, end: 999 }],
    ['bytes=900-5000', { kind: 'partial', start: 900, end: 999 }],
    [' bytes=1-1 ', { kind: 'partial', start: 1, end: 1 }],
  ])('%s of a 1000-byte file', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected)
  })

  test.each([
    ['no header', null],
    ['an empty range', 'bytes=-'],
    ['several ranges', 'bytes=0-1,5-6'],
    ['another unit', 'items=0-1'],
    ['garbage', 'bytes=a-b'],
    ['an end before the start', 'bytes=50-10'],
  ])('serves the whole file for %s', (_name, header) => {
    expect(parseRange(header, 1000)).toEqual({ kind: 'full' })
  })

  test.each([
    ['a start past the end', 'bytes=1000-', 1000],
    ['an empty suffix', 'bytes=-0', 1000],
    ['any suffix of an empty file', 'bytes=-10', 0],
  ])('is unsatisfiable for %s', (_name, header, size) => {
    expect(parseRange(header, size)).toEqual({ kind: 'unsatisfiable' })
  })
})
