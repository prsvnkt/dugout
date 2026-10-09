import { describe, expect, test } from 'vitest'
import {
  checkAnnotations,
  logTail,
  MAX_ANNOTATIONS,
  MAX_LOG_LINE_LENGTH,
  MAX_LOG_LINES,
  unresolvedThreads,
  type ReviewThreadNode,
} from './pullFeedback'

const thread = (extra: Partial<ReviewThreadNode> = {}): ReviewThreadNode => ({
  isResolved: false,
  isOutdated: false,
  path: 'src/app.ts',
  line: 12,
  startLine: null,
  originalLine: 10,
  originalStartLine: null,
  comments: { nodes: [{ author: { login: 'ann' }, body: ' Rename this. \n' }] },
  ...extra,
})

const response = (nodes: ReviewThreadNode[]) => ({
  data: { repository: { pullRequest: { reviewThreads: { nodes } } } },
})

describe('unresolvedThreads', () => {
  test('keeps unresolved threads with their location and trimmed comments', () => {
    // Act
    const threads = unresolvedThreads(response([thread()]))

    // Assert
    expect(threads).toEqual([
      {
        path: 'src/app.ts',
        line: 12,
        startLine: 12,
        isOutdated: false,
        comments: [{ author: 'ann', body: 'Rename this.' }],
      },
    ])
  })

  test('drops resolved threads and threads without comments', () => {
    const threads = unresolvedThreads(
      response([thread({ isResolved: true }), thread({ comments: { nodes: [] } })]),
    )
    expect(threads).toEqual([])
  })

  test('uses the original lines of an outdated thread', () => {
    const threads = unresolvedThreads(
      response([thread({ isOutdated: true, line: null, originalLine: 10, originalStartLine: 8 })]),
    )
    expect(threads[0]).toMatchObject({ line: 10, startLine: 8, isOutdated: true })
  })

  test('keeps a multi-line thread’s range and names deleted users "ghost"', () => {
    const threads = unresolvedThreads(
      response([thread({ startLine: 9, comments: { nodes: [{ author: null, body: 'Why?' }] } })]),
    )
    expect(threads[0]).toMatchObject({ startLine: 9, line: 12, comments: [{ author: 'ghost' }] })
  })

  test('reports GraphQL errors and a missing pull request', () => {
    expect(() => unresolvedThreads({ errors: [{ message: 'Bad things' }] })).toThrow(
      'GitHub: Bad things',
    )
    expect(() => unresolvedThreads({ data: { repository: null } })).toThrow('not found')
  })
})

describe('logTail', () => {
  test('ends at the last error and drops colours, timestamps and group markers', () => {
    // Arrange
    const log = [
      '2026-10-09T10:00:00.1234567Z ##[group]Run npm test',
      '2026-10-09T10:00:01.0000000Z \u001b[31mFAIL\u001b[0m src/app.test.ts',
      '2026-10-09T10:00:01.0000000Z ##[endgroup]',
      '2026-10-09T10:00:02.0000000Z ##[error]Process completed with exit code 1.',
      '2026-10-09T10:00:03.0000000Z Post job cleanup.',
    ].join('\n')

    // Act / Assert
    expect(logTail(log)).toBe('FAIL src/app.test.ts\nError: Process completed with exit code 1.')
  })

  test('keeps only the last lines, each clipped', () => {
    const long = 'x'.repeat(MAX_LOG_LINE_LENGTH + 50)
    const lines = Array.from({ length: MAX_LOG_LINES + 5 }, (_, i) => `line ${i}`)
    const tail = logTail([...lines, long].join('\n')) ?? ''
    const shown = tail.split('\n')
    expect(shown).toHaveLength(MAX_LOG_LINES)
    expect(shown[0]).toBe('line 6')
    expect(shown.at(-1)).toBe(`${'x'.repeat(MAX_LOG_LINE_LENGTH)}…`)
  })

  test('is null for an empty log', () => {
    expect(logTail('\n\n')).toBeNull()
  })
})

describe('checkAnnotations', () => {
  test('puts failures first, drops notices and caps the count', () => {
    // Arrange
    const note = (level: string | null, message: string) => ({
      path: 'src/a.ts',
      start_line: 3,
      annotation_level: level,
      message,
    })
    const many = Array.from({ length: MAX_ANNOTATIONS + 3 }, (_, i) => note('failure', `e${i}`))

    // Act
    const shown = checkAnnotations([note('warning', 'w'), note('notice', 'n'), ...many])

    // Assert
    expect(shown).toHaveLength(MAX_ANNOTATIONS)
    expect(shown[0]).toEqual({ path: 'src/a.ts', line: 3, level: 'failure', message: 'e0' })
    expect(shown.some((annotation) => annotation.message === 'n')).toBe(false)
  })
})
