import { describe, expect, test } from 'vitest'
import { parseStatus } from './parseStatus'

const NUL = '\0'
const record = (...entries: string[]) => entries.join(NUL) + NUL

describe('parseStatus', () => {
  test('reads branch, upstream and ahead/behind', () => {
    const status = parseStatus(
      record(
        '# branch.oid abc123',
        '# branch.head feat/x',
        '# branch.upstream origin/feat/x',
        '# branch.ab +2 -1',
      ),
    )
    expect(status).toEqual({
      branch: 'feat/x',
      upstream: 'origin/feat/x',
      ahead: 2,
      behind: 1,
      isUnborn: false,
      files: [],
    })
  })

  test('handles detached HEAD and an unborn branch', () => {
    expect(parseStatus(record('# branch.oid abc', '# branch.head (detached)')).branch).toBeNull()
    const unborn = parseStatus(record('# branch.oid (initial)', '# branch.head main'))
    expect(unborn).toMatchObject({ branch: 'main', isUnborn: true, upstream: null, ahead: 0 })
  })

  test('splits staged and unstaged changes of ordinary entries', () => {
    const status = parseStatus(
      record(
        '# branch.head main',
        '1 M. N... 100644 100644 100644 aaa bbb src/staged.ts',
        '1 .M N... 100644 100644 100644 aaa aaa src/unstaged.ts',
        '1 MD N... 100644 100644 000000 aaa bbb both.ts',
        '1 A. N... 000000 100644 100644 000 bbb added.ts',
      ),
    )
    expect(status.files).toEqual([
      { path: 'src/staged.ts', staged: 'modified', unstaged: null },
      { path: 'src/unstaged.ts', staged: null, unstaged: 'modified' },
      { path: 'both.ts', staged: 'modified', unstaged: 'deleted' },
      { path: 'added.ts', staged: 'added', unstaged: null },
    ])
  })

  test('reads renames, whose original path is the next NUL-separated field', () => {
    const status = parseStatus(
      record(
        '# branch.head main',
        '2 RM N... 100644 100644 100644 a a R100 new name.txt',
        'old.txt',
      ),
    )
    expect(status.files).toEqual([
      { path: 'new name.txt', originalPath: 'old.txt', staged: 'renamed', unstaged: 'modified' },
    ])
  })

  test('reads untracked files, keeping unusual characters', () => {
    const status = parseStatus(record('# branch.head main', '? sp ace*.txt'))
    expect(status.files).toEqual([{ path: 'sp ace*.txt', staged: null, unstaged: 'untracked' }])
  })

  test('marks merge conflicts as unstaged conflicts', () => {
    const status = parseStatus(
      record('# branch.head main', 'u UU N... 100644 100644 100644 100644 a b c conflict.ts'),
    )
    expect(status.files).toEqual([{ path: 'conflict.ts', staged: null, unstaged: 'conflicted' }])
  })

  test('ignores ignored-file entries', () => {
    expect(parseStatus(record('# branch.head main', '! build/')).files).toEqual([])
  })
})
