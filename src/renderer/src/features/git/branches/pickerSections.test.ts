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
  remote('origin/feat/remote-thing'),
]

const labels = (items: readonly PickerItem[]) =>
  items.map((item) => (item.kind === 'branch' ? item.branch.name : item.kind))

describe('pickerSections in switch mode', () => {
  test('lists actions, then local branches, then remote branches', () => {
    const sections = pickerSections(BRANCHES, '', { kind: 'switch' })

    expect(sections.map((section) => section.title)).toEqual([null, 'Branches', 'Remote branches'])
    expect(labels(sections[0]?.items ?? [])).toEqual(['worktree'])
    expect(labels(sections[1]?.items ?? [])).toEqual(['main', 'feat/seti-icons', 'dugout/7-fix'])
  })

  test('offers to create the typed name when no branch has it', () => {
    const [actions] = pickerSections(BRANCHES, 'feat/new', { kind: 'switch' })

    expect(actions?.items).toEqual([
      { kind: 'create', id: 'create', name: 'feat/new' },
      { kind: 'createFrom', id: 'createFrom', name: 'feat/new' },
      { kind: 'worktree', id: 'worktree' },
    ])
  })

  test('filters branches by name, ignoring case, and drops empty sections', () => {
    const sections = pickerSections(BRANCHES, 'SETI', { kind: 'switch' })

    expect(sections.map((section) => section.title)).toEqual([null, 'Branches'])
    expect(labels(sections[1]?.items ?? [])).toEqual(['feat/seti-icons'])
  })

  test('does not offer to create a branch that already exists', () => {
    const [actions] = pickerSections(BRANCHES, 'main', { kind: 'switch' })

    expect(labels(actions?.items ?? [])).toEqual(['worktree'])
  })

  test('explains why some branches cannot be checked out', () => {
    const [, branches] = pickerSections(BRANCHES, '', { kind: 'switch' })
    const reasons = branches?.items.map((item) =>
      item.kind === 'branch' ? item.disabledReason : null,
    )

    expect(reasons).toEqual(['current', null, 'in a worktree'])
  })
})

describe('pickerSections in base mode', () => {
  test('lists every branch as a possible starting point, without actions', () => {
    const sections = pickerSections(BRANCHES, '', { kind: 'base', newName: 'feat/new' })

    expect(sections.map((section) => section.title)).toEqual(['Branches', 'Remote branches'])
    expect(
      sections
        .flatMap((section) => section.items)
        .every((item) => item.kind === 'branch' && item.disabledReason === null),
    ).toBe(true)
  })
})
