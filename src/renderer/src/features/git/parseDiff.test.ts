import { describe, expect, test } from 'vitest'
import { parseDiff } from './parseDiff'

const DIFF = [
  'diff --git a/readme.md b/readme.md',
  'index 1111111..2222222 100644',
  '--- a/readme.md',
  '+++ b/readme.md',
  '@@ -1,3 +1,3 @@ heading',
  ' keep',
  '-old',
  '+new',
  ' tail',
  '@@ -10,2 +10,3 @@',
  ' ten',
  '+inserted',
  ' eleven',
  '\\ No newline at end of file',
  '',
].join('\n')

describe('parseDiff', () => {
  test('splits hunks and numbers old and new lines', () => {
    const hunks = parseDiff(DIFF)

    expect(hunks).toHaveLength(2)
    expect(hunks[0]?.header).toBe('@@ -1,3 +1,3 @@ heading')
    expect(hunks[0]?.lines).toEqual([
      { kind: 'context', text: 'keep', oldLine: 1, newLine: 1 },
      { kind: 'removed', text: 'old', oldLine: 2, newLine: null },
      { kind: 'added', text: 'new', oldLine: null, newLine: 2 },
      { kind: 'context', text: 'tail', oldLine: 3, newLine: 3 },
    ])
  })

  test('continues numbering from each hunk header', () => {
    const second = parseDiff(DIFF)[1]
    expect(second?.lines.map((line) => [line.oldLine, line.newLine])).toEqual([
      [10, 10],
      [null, 11],
      [11, 12],
    ])
  })

  test('drops "no newline" markers and file headers', () => {
    const texts = parseDiff(DIFF).flatMap((hunk) => hunk.lines.map((line) => line.text))
    expect(texts).not.toContain('No newline at end of file')
    expect(texts.some((text) => text.includes('readme.md'))).toBe(false)
  })

  test('returns no hunks for an empty diff', () => {
    expect(parseDiff('')).toEqual([])
  })
})
