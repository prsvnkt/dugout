import { describe, expect, test } from 'vitest'
import type { DirEntry } from '@shared/files'
import { tabStopPath, treeKeyMove, visibleRows } from './treeKeys'

const dir = (path: string): DirEntry => ({
  name: path.split('/').pop() ?? path,
  path,
  kind: 'dir',
  isIgnored: false,
})
const file = (path: string): DirEntry => ({ ...dir(path), kind: 'file' })

const ENTRIES = {
  '': [dir('src'), dir('docs'), file('readme.md')],
  src: [dir('src/lib'), file('src/app.ts')],
  'src/lib': [file('src/lib/util.ts')],
  docs: [file('docs/guide.md')],
}

describe('visibleRows', () => {
  test('lists open folders depth first and skips closed ones', () => {
    // Act
    const rows = visibleRows(ENTRIES, ['src'])

    // Assert
    expect(rows.map((row) => row.path)).toEqual([
      'src',
      'src/lib',
      'src/app.ts',
      'docs',
      'readme.md',
    ])
    expect(rows[0]).toEqual({ path: 'src', isDir: true, isExpanded: true, parent: '' })
    expect(rows[1]?.parent).toBe('src')
  })

  test('an open folder that has not loaded yet shows no children', () => {
    expect(visibleRows({ '': [dir('src')] }, ['src']).map((row) => row.path)).toEqual(['src'])
  })
})

describe('tabStopPath', () => {
  const rows = visibleRows(ENTRIES, [])

  test('takes the first candidate that is shown', () => {
    expect(tabStopPath(rows, ['src/app.ts', 'docs'])).toBe('docs')
  })

  test('falls back to the first row, or null for an empty tree', () => {
    expect(tabStopPath(rows, [null])).toBe('src')
    expect(tabStopPath([], ['src'])).toBeNull()
  })
})

describe('treeKeyMove', () => {
  const closed = visibleRows(ENTRIES, [])
  const open = visibleRows(ENTRIES, ['src'])

  test('Down and Up move between shown rows and stop at the ends', () => {
    expect(treeKeyMove(open, 'src', 'ArrowDown')).toEqual({ kind: 'focus', path: 'src/lib' })
    expect(treeKeyMove(open, 'docs', 'ArrowUp')).toEqual({ kind: 'focus', path: 'src/app.ts' })
    expect(treeKeyMove(open, 'readme.md', 'ArrowDown')).toEqual({
      kind: 'focus',
      path: 'readme.md',
    })
  })

  test('Home and End go to the first and last shown row', () => {
    expect(treeKeyMove(open, 'docs', 'Home')).toEqual({ kind: 'focus', path: 'src' })
    expect(treeKeyMove(open, 'src', 'End')).toEqual({ kind: 'focus', path: 'readme.md' })
  })

  test('Right opens a closed folder, then moves into it', () => {
    expect(treeKeyMove(closed, 'src', 'ArrowRight')).toEqual({ kind: 'toggle', path: 'src' })
    expect(treeKeyMove(open, 'src', 'ArrowRight')).toEqual({ kind: 'focus', path: 'src/lib' })
  })

  test('Right does nothing on a file or an open folder with no rows yet', () => {
    expect(treeKeyMove(open, 'src/app.ts', 'ArrowRight')).toBeNull()
    const loading = visibleRows({ '': [dir('src')] }, ['src'])
    expect(treeKeyMove(loading, 'src', 'ArrowRight')).toBeNull()
  })

  test('Left closes an open folder, otherwise moves to the parent', () => {
    expect(treeKeyMove(open, 'src', 'ArrowLeft')).toEqual({ kind: 'toggle', path: 'src' })
    expect(treeKeyMove(open, 'src/app.ts', 'ArrowLeft')).toEqual({ kind: 'focus', path: 'src' })
    expect(treeKeyMove(open, 'docs', 'ArrowLeft')).toBeNull()
  })

  test('other keys do nothing', () => {
    expect(treeKeyMove(open, 'src', 'Enter')).toBeNull()
    expect(treeKeyMove(open, 'src', 'a')).toBeNull()
  })
})
