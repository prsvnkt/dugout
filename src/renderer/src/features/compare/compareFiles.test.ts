import { describe, expect, test } from 'vitest'
import { compareFiles } from './compareFiles'

describe('compareFiles', () => {
  test('merges both sides and marks who changed each file', () => {
    const files = compareFiles([
      {
        worktreePath: '/a',
        changes: [
          { path: 'src/b.ts', kind: 'modified' },
          { path: 'a.ts', kind: 'added' },
        ],
      },
      {
        worktreePath: '/b',
        changes: [
          { path: 'src/b.ts', kind: 'modified' },
          { path: 'c.ts', kind: 'added' },
        ],
      },
    ])
    expect(files).toEqual([
      { path: 'a.ts', changedIn: [0] },
      { path: 'c.ts', changedIn: [1] },
      { path: 'src/b.ts', changedIn: [0, 1] },
    ])
  })
})
