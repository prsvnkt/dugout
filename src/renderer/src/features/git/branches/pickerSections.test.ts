import { describe, expect, test } from 'vitest'
import type { GitBranch } from '@shared/git'
import { pickerSections, type PickerItem } from './pickerSections'

const commit = { sha: 'abc1234', subject: 's', author: 'a', date: '2026-10-07T12:00:00Z' }
const local = (name: string, extra: Partial<Extract<GitBranch, { kind: 'local' }>> = {}) =>
  ({ kind: 'local', name, isCurrent: false, checkedOutAt: null, commit, ...extra }) as const
const remote = (name: string) =>
  ({ kind: 'remote', name, localName: name.split('/').slice(1).join('/'), commit }) as const

const BRANCHES: GitBranch[] = [
  local('main', { isCurrent: true }),
  local('feat/seti-icons'),
  local('dugout/7-fix', { checkedOutAt: '/wt/7' }),
  local('dugout/a1b2c3'),
  remote('origin/feat/remote-thing'),
]

const COLLAPSED = { showSessions: false }
const EXPANDED = { showSessions: true }

const labels = (items: readonly PickerItem[]) =>
  items.map((item) => (item.kind === 'branch' ? item.branch.name : item.kind))

describe('pickerSections in switch mode', () => {
  test('lists actions, then local branches, then remote branches', () => {
    const sections = pickerSections(BRANCHES, '', { kind: 'switch' }, COLLAPSED)

    expect(sections.map((section) => section.title)).toEqual([
      null,
      'Branches',
      'Remote branches',
      'Agent sessions',
    ])
    expect(labels(sections[0]?.items ?? [])).toEqual(['worktree'])
    expect(labels(sections[1]?.items ?? [])).toEqual(['main', 'feat/seti-icons'])
  })

  test('offers to create the typed name when no branch has it', () => {
    const [actions] = pickerSections(BRANCHES, 'feat/new', { kind: 'switch' }, COLLAPSED)

    expect(actions?.items).toEqual([
      { kind: 'create', id: 'create', name: 'feat/new' },
      { kind: 'createFrom', id: 'createFrom', name: 'feat/new' },
      { kind: 'worktree', id: 'worktree' },
    ])
  })

  test('filters branches by name, ignoring case, and drops empty sections', () => {
    const sections = pickerSections(BRANCHES, 'SETI', { kind: 'switch' }, COLLAPSED)

    expect(sections.map((section) => section.title)).toEqual([null, 'Branches'])
    expect(labels(sections[1]?.items ?? [])).toEqual(['feat/seti-icons'])
  })

  test('does not offer to create a branch that already exists', () => {
    const [actions] = pickerSections(BRANCHES, 'main', { kind: 'switch' }, COLLAPSED)

    expect(labels(actions?.items ?? [])).toEqual(['worktree'])
  })

  test('explains why some branches cannot be checked out', () => {
    const [, branches] = pickerSections(BRANCHES, '', { kind: 'switch' }, COLLAPSED)
    const reasons = branches?.items.map((item) =>
      item.kind === 'branch' ? item.disabledReason : null,
    )

    expect(reasons).toEqual(['current', null])
  })
})

describe('agent session branches', () => {
  test('collapse into one row that says how many there are', () => {
    const sessions = pickerSections(BRANCHES, '', { kind: 'switch' }, COLLAPSED).at(-1)

    expect(sessions?.items).toEqual([
      { kind: 'sessions', id: 'sessions', count: 2, isExpanded: false },
    ])
  })

  test('list each session branch when expanded, after the toggle', () => {
    const sessions = pickerSections(BRANCHES, '', { kind: 'switch' }, EXPANDED).at(-1)

    expect(labels(sessions?.items ?? [])).toEqual(['sessions', 'dugout/7-fix', 'dugout/a1b2c3'])
    const fix = sessions?.items[1]
    expect(fix?.kind === 'branch' && fix.disabledReason).toBe('in a worktree')
  })

  test('show matches without the toggle while searching', () => {
    const sessions = pickerSections(BRANCHES, 'a1b2', { kind: 'switch' }, COLLAPSED).at(-1)

    expect(sessions?.title).toBe('Agent sessions')
    expect(labels(sessions?.items ?? [])).toEqual(['dugout/a1b2c3'])
  })
})

describe('pickerSections in base mode', () => {
  test('lists every branch as a possible starting point, without actions', () => {
    const sections = pickerSections(BRANCHES, '', { kind: 'base', newName: 'feat/new' }, EXPANDED)

    expect(sections.map((section) => section.title)).toEqual([
      'Branches',
      'Remote branches',
      'Agent sessions',
    ])
    expect(
      sections
        .flatMap((section) => section.items)
        .every(
          (item) =>
            item.kind === 'sessions' || (item.kind === 'branch' && item.disabledReason === null),
        ),
    ).toBe(true)
  })
})
