import { describe, expect, it } from 'vitest'
import {
  formatReviewPrompt,
  lineLabel,
  selectedLines,
  REVIEW_PROMPT_HEADING,
  MAX_QUOTED_LINES,
  type CommentContent,
} from './reviewPrompt'

const comment = (overrides: Partial<CommentContent> = {}): CommentContent => ({
  path: 'src/app.ts',
  startLine: 2,
  endLine: 2,
  code: 'const answer = 41',
  text: 'Should be 42.',
  ...overrides,
})

describe('lineLabel', () => {
  it('names one line as path:line', () => {
    expect(lineLabel(comment())).toBe('src/app.ts:2')
  })

  it('names a range as path:start-end', () => {
    expect(lineLabel(comment({ startLine: 4, endLine: 6 }))).toBe('src/app.ts:4-6')
  })
})

describe('formatReviewPrompt', () => {
  it('lists each comment with its location, quoted code and text', () => {
    // Arrange
    const comments = [
      comment(),
      comment({ path: 'README.md', startLine: 1, endLine: 2, code: 'a\nb', text: 'Reword.' }),
    ]

    // Act
    const prompt = formatReviewPrompt(comments)

    // Assert
    expect(prompt).toBe(
      [
        REVIEW_PROMPT_HEADING,
        '',
        '1. src/app.ts:2',
        '> const answer = 41',
        'Should be 42.',
        '',
        '2. README.md:1-2',
        '> a',
        '> b',
        'Reword.',
      ].join('\n'),
    )
  })

  it('quotes blank lines as a bare marker and keeps multi-line comments', () => {
    const prompt = formatReviewPrompt([comment({ code: 'x\n\ny', text: 'First.\nSecond.' })])

    expect(prompt).toContain('> x\n>\n> y\nFirst.\nSecond.')
  })

  it('clips long quotes and says how many lines were left out', () => {
    // Arrange
    const code = Array.from({ length: MAX_QUOTED_LINES + 3 }, (_, i) => `line ${i + 1}`).join('\n')

    // Act
    const prompt = formatReviewPrompt([comment({ endLine: 30, code })])

    // Assert
    expect(prompt).toContain(`> line ${MAX_QUOTED_LINES}\n> … (3 more lines)`)
    expect(prompt).not.toContain(`line ${MAX_QUOTED_LINES + 1}`)
  })

  it('trims whitespace around comment text', () => {
    expect(formatReviewPrompt([comment({ text: '  Fix it.\n' })])).toMatch(/Fix it\.$/)
  })
})

describe('selectedLines', () => {
  it('uses the cursor line when nothing is selected', () => {
    expect(selectedLines({ startLine: 5, startColumn: 3, endLine: 5, endColumn: 3 })).toEqual({
      startLine: 5,
      endLine: 5,
    })
  })

  it('leaves out a last line the selection only touches at its start', () => {
    expect(selectedLines({ startLine: 2, startColumn: 1, endLine: 5, endColumn: 1 })).toEqual({
      startLine: 2,
      endLine: 4,
    })
  })

  it('orders a selection made backwards', () => {
    expect(selectedLines({ startLine: 7, startColumn: 4, endLine: 3, endColumn: 2 })).toEqual({
      startLine: 3,
      endLine: 7,
    })
  })
})
