import { describe, expect, test } from 'vitest'
import type { FailingCheck, PullReviewThread } from '@shared/pullRequest'
import {
  fitPrompt,
  formatFailingChecksPrompt,
  formatReviewThreadsPrompt,
  MAX_ENTRY_TEXT_LENGTH,
} from './pullRequestPrompt'

const MAX = 10_000

const thread = (extra: Partial<PullReviewThread> = {}): PullReviewThread => ({
  path: 'src/app.ts',
  startLine: 12,
  line: 12,
  isOutdated: false,
  comments: [
    { author: 'ann', body: 'Rename this.' },
    { author: 'bob', body: 'Agreed.' },
  ],
  ...extra,
})

const check = (extra: Partial<FailingCheck> = {}): FailingCheck => ({
  name: 'test',
  url: 'https://github.com/o/r/runs/1',
  title: 'Tests failed',
  summary: null,
  annotations: [],
  logTail: null,
  ...extra,
})

describe('formatReviewThreadsPrompt', () => {
  test('lists each thread’s location and its comments by author', () => {
    // Act
    const prompt = formatReviewThreadsPrompt(
      7,
      [thread(), thread({ path: 'b.ts', startLine: 3, line: 5 })],
      MAX,
    )

    // Assert
    expect(prompt).toBe(
      [
        'Unresolved review comments on pull request #7. Please address each one:',
        '1. src/app.ts:12\nann: Rename this.\nbob: Agreed.',
        '2. b.ts:3-5\nann: Rename this.\nbob: Agreed.',
      ].join('\n\n'),
    )
  })

  test('marks outdated threads and file-level threads', () => {
    const prompt = formatReviewThreadsPrompt(
      7,
      [thread({ isOutdated: true }), thread({ path: 'c.ts', line: null, startLine: null })],
      MAX,
    )
    expect(prompt).toContain('1. src/app.ts:12 (outdated: the code has changed since)')
    expect(prompt).toContain('2. c.ts\n')
  })

  test('clips very long comments', () => {
    const body = 'x'.repeat(MAX_ENTRY_TEXT_LENGTH + 100)
    const prompt = formatReviewThreadsPrompt(
      7,
      [thread({ comments: [{ author: 'a', body }] })],
      MAX,
    )
    expect(prompt).toContain(`a: ${'x'.repeat(MAX_ENTRY_TEXT_LENGTH)}…`)
    expect(prompt).not.toContain('x'.repeat(MAX_ENTRY_TEXT_LENGTH + 1))
  })
})

describe('formatFailingChecksPrompt', () => {
  test('includes the title, summary, annotations and the end of the log', () => {
    // Arrange
    const failing = check({
      summary: '2 tests failed',
      annotations: [{ path: 'src/a.ts', line: 4, level: 'failure', message: 'Expected 1' }],
      logTail: 'FAIL src/a.test.ts\nError: exit 1',
    })

    // Act
    const prompt = formatFailingChecksPrompt(7, [failing], MAX)

    // Assert
    expect(prompt).toBe(
      [
        'CI is failing on pull request #7. Please find the cause and fix it:',
        [
          '1. test: Tests failed',
          '2 tests failed',
          'Annotations:',
          '- src/a.ts:4 (failure): Expected 1',
          'End of the log:',
          '```',
          'FAIL src/a.test.ts\nError: exit 1',
          '```',
        ].join('\n'),
      ].join('\n\n'),
    )
  })

  test('links to the check when GitHub gave no details', () => {
    const prompt = formatFailingChecksPrompt(7, [check({ title: null })], MAX)
    expect(prompt).toContain('1. test\nDetails: https://github.com/o/r/runs/1')
  })
})

describe('fitPrompt', () => {
  test('keeps whole entries and counts the ones that do not fit', () => {
    // Arrange
    const entries = ['a'.repeat(40), 'b'.repeat(40), 'c'.repeat(40)]

    // Act
    const prompt = fitPrompt('Head', entries, 100)

    // Assert
    expect(prompt).toBe(`Head\n\n${'a'.repeat(40)}\n\n… and 2 more on GitHub.`)
    expect(prompt.length).toBeLessThanOrEqual(100)
  })

  test('clips a first entry that is too long on its own', () => {
    const prompt = fitPrompt('Head', ['x'.repeat(500), 'y'.repeat(50)], 100)
    expect(prompt.length).toBeLessThanOrEqual(100)
    expect(prompt).toMatch(/^Head\n\nx+…\n\n… and 1 more on GitHub\.$/)
  })

  test('returns everything when it fits', () => {
    expect(fitPrompt('Head', ['one', 'two'], 100)).toBe('Head\n\none\n\ntwo')
  })
})
