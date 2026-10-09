import { describe, expect, test } from 'vitest'
import { relatedIn, withRelated } from './relatedTasks'

describe('related tasks', () => {
  test('adds "Related: #n" lines after the description', () => {
    expect(withRelated('Fix the bug.\n', [3, 4])).toBe('Fix the bug.\n\nRelated: #3\nRelated: #4')
  })

  test('an empty description gets only the lines', () => {
    expect(withRelated('', [3])).toBe('Related: #3')
  })

  test('skips tasks already listed and duplicates', () => {
    const body = 'Fix it.\n\nRelated: #3'
    expect(withRelated(body, [3, 5, 5])).toBe('Fix it.\n\nRelated: #3\nRelated: #5')
  })

  test('leaves the description alone when nothing is new', () => {
    expect(withRelated('Fix it.\n\nRelated: #3\n', [3])).toBe('Fix it.\n\nRelated: #3\n')
    expect(withRelated('Fix it.', [])).toBe('Fix it.')
  })

  test('reads related lines, not other mentions', () => {
    expect(relatedIn('See #9.\nRelated: #3\nRelated: #12')).toEqual([3, 12])
  })
})
