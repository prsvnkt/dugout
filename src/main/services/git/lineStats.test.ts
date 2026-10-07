import { describe, expect, test } from 'vitest'
import type { GitFileChange } from '@shared/git'
import { countLines, parseNumstat, withLineStats } from './lineStats'

describe('parseNumstat', () => {
  test('reads added and removed lines per path', () => {
    // Arrange
    const stdout = '2\t1\tsrc/app.ts\0' + '0\t5\tnotes.md\0'

    // Act
    const stats = parseNumstat(stdout)

    // Assert
    expect(stats.get('src/app.ts')).toEqual({ kind: 'text', additions: 2, deletions: 1 })
    expect(stats.get('notes.md')).toEqual({ kind: 'text', additions: 0, deletions: 5 })
  })

  test('marks binary files, which have no line counts', () => {
    expect(parseNumstat('-\t-\tlogo.png\0').get('logo.png')).toEqual({ kind: 'binary' })
  })

  test('keys renames by their new path', () => {
    const stats = parseNumstat('1\t0\t\0old name.ts\0new name.ts\0' + '3\t0\tafter.ts\0')

    expect(stats.get('new name.ts')).toEqual({ kind: 'text', additions: 1, deletions: 0 })
    expect(stats.get('old name.ts')).toBeUndefined()
    expect(stats.get('after.ts')).toEqual({ kind: 'text', additions: 3, deletions: 0 })
  })

  test('returns nothing for empty output', () => {
    expect(parseNumstat('').size).toBe(0)
  })
})

describe('countLines', () => {
  test('counts lines, including a last line without a newline', () => {
    expect(countLines(Buffer.from('a\nb\nc'))).toEqual({ kind: 'text', additions: 3, deletions: 0 })
    expect(countLines(Buffer.from('a\nb\n'))).toEqual({ kind: 'text', additions: 2, deletions: 0 })
    expect(countLines(Buffer.from(''))).toEqual({ kind: 'text', additions: 0, deletions: 0 })
  })

  test('treats content with a NUL byte as binary, like git', () => {
    expect(countLines(Buffer.from('PNG\0data'))).toEqual({ kind: 'binary' })
  })
})

describe('withLineStats', () => {
  const files: GitFileChange[] = [
    { path: 'both.ts', staged: 'modified', unstaged: 'modified' },
    { path: 'new.ts', staged: null, unstaged: 'untracked' },
    { path: 'gone.ts', staged: 'deleted', unstaged: null },
  ]

  test('attaches staged and unstaged stats to each side of a file', () => {
    // Arrange
    const staged = new Map([
      ['both.ts', { kind: 'text', additions: 1, deletions: 0 } as const],
      ['gone.ts', { kind: 'text', additions: 0, deletions: 9 } as const],
    ])
    const unstaged = new Map([['both.ts', { kind: 'text', additions: 0, deletions: 2 } as const]])
    const untracked = new Map([['new.ts', { kind: 'text', additions: 4, deletions: 0 } as const]])

    // Act
    const result = withLineStats(files, { staged, unstaged, untracked })

    // Assert
    expect(result).toEqual([
      {
        ...files[0],
        stagedStats: { kind: 'text', additions: 1, deletions: 0 },
        unstagedStats: { kind: 'text', additions: 0, deletions: 2 },
      },
      {
        ...files[1],
        stagedStats: null,
        unstagedStats: { kind: 'text', additions: 4, deletions: 0 },
      },
      {
        ...files[2],
        stagedStats: { kind: 'text', additions: 0, deletions: 9 },
        unstagedStats: null,
      },
    ])
  })

  test('leaves stats unknown when git reported none, and does not mutate the input', () => {
    const empty = new Map()
    const frozen = Object.freeze(files.map((file) => Object.freeze({ ...file })))

    const result = withLineStats(frozen, { staged: empty, unstaged: empty, untracked: empty })

    expect(result.every((file) => file.stagedStats === null && file.unstagedStats === null)).toBe(
      true,
    )
    expect(frozen[0]).not.toHaveProperty('stagedStats')
  })
})
