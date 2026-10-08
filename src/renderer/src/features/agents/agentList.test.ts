import { describe, expect, test } from 'vitest'
import { agentEntries } from './agentList'

const pane = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'claude' as const,
  generation: 0,
  ...extra,
})

describe('agentEntries', () => {
  test('lists agent panes in terminal order, numbered by position, without shells', () => {
    const layout = {
      panes: [
        pane('a'),
        pane('s', { kind: 'shell' }),
        pane('b', {
          kind: 'codex',
          task: { number: 12, title: 'Fix login' },
          worktree: { path: '/wt/b', branch: 'dugout/b' },
        }),
      ],
      focusedPaneId: 'b',
    }

    const entries = agentEntries({
      layout,
      activities: { a: 'working', b: 'needs-input', s: 'running' },
      details: { b: { detail: 'Bash: npm test', since: 5 } },
    })

    expect(entries).toEqual([
      {
        paneId: 'a',
        number: '01',
        agentLabel: 'Claude',
        activity: 'working',
        detail: null,
        task: null,
        title: null,
        branch: null,
        isFocused: false,
      },
      {
        paneId: 'b',
        number: '03',
        agentLabel: 'Codex',
        activity: 'needs-input',
        detail: 'Bash: npm test',
        task: { number: 12, title: 'Fix login' },
        title: null,
        branch: 'dugout/b',
        isFocused: true,
      },
    ])
  })

  test('an agent that has not reported yet is starting', () => {
    const entries = agentEntries({
      layout: { panes: [pane('a', { title: 'Add tests' })], focusedPaneId: null },
      activities: {},
      details: {},
    })
    expect(entries[0]).toMatchObject({ activity: 'starting', title: 'Add tests' })
  })
})
