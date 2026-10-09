import { describe, expect, test } from 'vitest'
import {
  changedElsewhere,
  findOverlaps,
  labelOverlaps,
  overlapDetail,
  overlapSummary,
} from './overlaps'

describe('findOverlaps', () => {
  test('reports files two worktrees both changed, on both sides', () => {
    const overlaps = findOverlaps([
      { worktreePath: '/a', files: ['src/b.ts', 'src/a.ts', 'README.md'] },
      { worktreePath: '/b', files: ['src/a.ts', 'src/b.ts'] },
    ])
    expect(overlaps.get('/a')).toEqual([{ worktreePath: '/b', files: ['src/a.ts', 'src/b.ts'] }])
    expect(overlaps.get('/b')).toEqual([{ worktreePath: '/a', files: ['src/a.ts', 'src/b.ts'] }])
  })

  test('leaves out worktrees that share no files', () => {
    const overlaps = findOverlaps([
      { worktreePath: '/a', files: ['a.ts'] },
      { worktreePath: '/b', files: ['b.ts'] },
      { worktreePath: '/c', files: [] },
    ])
    expect(overlaps.size).toBe(0)
  })

  test('lists every other worktree a worktree overlaps with', () => {
    const overlaps = findOverlaps([
      { worktreePath: '/a', files: ['x.ts', 'y.ts'] },
      { worktreePath: '/b', files: ['x.ts'] },
      { worktreePath: '/c', files: ['y.ts'] },
    ])
    expect(overlaps.get('/a')).toEqual([
      { worktreePath: '/b', files: ['x.ts'] },
      { worktreePath: '/c', files: ['y.ts'] },
    ])
    expect(overlaps.get('/b')).toEqual([{ worktreePath: '/a', files: ['x.ts'] }])
    expect(overlaps.has('/c')).toBe(true)
  })

  test('ignores attempts at the same task, but not different tasks', () => {
    const overlaps = findOverlaps([
      { worktreePath: '/claude', files: ['x.ts'], taskNumber: 12 },
      { worktreePath: '/codex', files: ['x.ts'], taskNumber: 12 },
      { worktreePath: '/other', files: ['x.ts'], taskNumber: 15 },
    ])
    expect(overlaps.get('/claude')).toEqual([{ worktreePath: '/other', files: ['x.ts'] }])
    expect(overlaps.get('/other')).toEqual([
      { worktreePath: '/claude', files: ['x.ts'] },
      { worktreePath: '/codex', files: ['x.ts'] },
    ])
  })

  test('ignores a worktree listed twice', () => {
    expect(
      findOverlaps([
        { worktreePath: '/a', files: ['x.ts'] },
        { worktreePath: '/a', files: ['x.ts'] },
      ]).size,
    ).toBe(0)
  })
})

describe('changedElsewhere', () => {
  test('maps files to the other worktrees that changed them, skipping the sides', () => {
    const elsewhere = changedElsewhere(
      [
        { worktreePath: '/claude', files: ['x.ts', 'y.ts'], taskNumber: 12 },
        { worktreePath: '/codex', files: ['x.ts'], taskNumber: 12 },
        { worktreePath: '/third', files: ['x.ts'], taskNumber: 12 },
        { worktreePath: '/other', files: ['x.ts', 'z.ts'], taskNumber: 15 },
        { worktreePath: '/free', files: ['x.ts'] },
      ],
      ['/claude', '/codex'],
    )
    expect([...elsewhere]).toEqual([
      ['x.ts', ['/other', '/free']],
      ['z.ts', ['/other']],
    ])
  })
})

describe('labelOverlaps', () => {
  test('merges overlaps that share a label and sorts by label', () => {
    const labels: Record<string, string> = { '/claude': '#12', '/codex': '#12', '/w': 'amber' }
    const labelled = labelOverlaps(
      [
        { worktreePath: '/w', files: ['z.ts'] },
        { worktreePath: '/codex', files: ['b.ts', 'x.ts'] },
        { worktreePath: '/claude', files: ['x.ts', 'a.ts'] },
      ],
      (path) => labels[path] ?? path,
    )
    expect(labelled).toEqual([
      { label: '#12', files: ['a.ts', 'b.ts', 'x.ts'] },
      { label: 'amber', files: ['z.ts'] },
    ])
  })
})

describe('overlap text', () => {
  const overlaps = [
    { label: '#12', files: ['a.ts', 'b.ts'] },
    { label: 'Codex (k3x9)', files: ['c.ts'] },
  ]

  test('summary names every other agent', () => {
    expect(overlapSummary(overlaps)).toBe('also changed by #12, Codex (k3x9)')
  })

  test('detail lists the files per agent', () => {
    expect(overlapDetail(overlaps)).toBe(
      '#12 also changed:\na.ts\nb.ts\n\nCodex (k3x9) also changed:\nc.ts',
    )
  })
})
