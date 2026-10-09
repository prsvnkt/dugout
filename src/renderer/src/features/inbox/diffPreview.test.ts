import { describe, expect, test } from 'vitest'
import { diffPreview, MAX_DIFF_LINES } from './diffPreview'

describe('diffPreview', () => {
  test('shows changed lines as removed then added, around unchanged context', () => {
    // Arrange
    const change = {
      before: 'import a\nlet x = 1\nexport x',
      after: 'import a\nconst x = 1\nexport x',
    }

    // Act
    const lines = diffPreview(change)

    // Assert
    expect(lines).toEqual([
      { type: 'context', text: 'import a' },
      { type: 'removed', text: 'let x = 1' },
      { type: 'added', text: 'const x = 1' },
      { type: 'context', text: 'export x' },
    ])
  })

  test('keeps only a little context around the change', () => {
    const shared = ['1', '2', '3', '4', '5']
    const lines = diffPreview({
      before: [...shared, 'old', ...shared].join('\n'),
      after: [...shared, 'new', ...shared].join('\n'),
    })
    expect(lines.map((line) => line.text)).toEqual(['4', '5', 'old', 'new', '1', '2'])
  })

  test('a new file is all added lines', () => {
    expect(diffPreview({ before: '', after: 'a\nb' })).toEqual([
      { type: 'added', text: 'a' },
      { type: 'added', text: 'b' },
    ])
  })

  test('caps very long changes and says how many lines are left out', () => {
    const after = Array.from({ length: MAX_DIFF_LINES + 10 }, (_, i) => `line ${i}`).join('\n')
    const lines = diffPreview({ before: '', after })
    expect(lines).toHaveLength(MAX_DIFF_LINES + 1)
    expect(lines.at(-1)).toEqual({ type: 'more', text: '10 more lines' })
  })
})
