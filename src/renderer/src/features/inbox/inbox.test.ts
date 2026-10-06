import { describe, expect, test } from 'vitest'
import type { Project } from '@shared/project'
import { inboxEntries } from './inbox'

const project = (id: string, name: string): Project => ({
  id,
  name,
  rootPath: `/${id}`,
  color: 'teal',
  createdAt: '2026-10-06T00:00:00Z',
})
const pane = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'claude' as const,
  generation: 0,
  ...extra,
})

describe('inboxEntries', () => {
  const projects = [project('p1', 'bene'), project('p2', 'muv')]
  const layouts = {
    p1: {
      panes: [pane('a'), pane('b', { task: { number: 12, title: 'Fix' } })],
      focusedPaneId: null,
    },
    p2: { panes: [pane('c'), pane('d', { kind: 'shell' })], focusedPaneId: null },
  }

  test('lists agents that need you first, then finished ones, newest first', () => {
    const entries = inboxEntries({
      projects,
      layouts,
      activities: { a: 'done', b: 'needs-input', c: 'done', d: 'running' },
      details: {
        a: { detail: 'Done A', since: 1 },
        b: { detail: 'Bash: npm install', since: 2 },
        c: { detail: 'Done C', since: 3 },
      },
    })

    expect(entries.map((entry) => [entry.paneId, entry.activity])).toEqual([
      ['b', 'needs-input'],
      ['c', 'done'],
      ['a', 'done'],
    ])
    expect(entries[0]).toMatchObject({
      projectId: 'p1',
      projectName: 'bene',
      agentLabel: 'Claude',
      taskNumber: 12,
      detail: 'Bash: npm install',
    })
  })

  test('is empty when no agent needs attention', () => {
    expect(
      inboxEntries({ projects, layouts, activities: { a: 'working', b: 'idle' }, details: {} }),
    ).toEqual([])
  })
})
