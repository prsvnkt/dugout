import { describe, expect, test } from 'vitest'
import { projectAttention, toPaneActivity, type PaneActivity } from './paneActivity'

describe('toPaneActivity', () => {
  test('shell terminals report their process state', () => {
    expect(toPaneActivity({ state: 'running' }, null, false)).toBe('running')
    expect(toPaneActivity({ state: 'exited', exit: { exitCode: 0 } }, null, false)).toBe('exited')
  })

  test('running claude terminals report their agent status', () => {
    expect(toPaneActivity({ state: 'running' }, 'needs-input', false)).toBe('needs-input')
    expect(toPaneActivity({ state: 'running' }, 'working', false)).toBe('working')
  })

  test('a finished turn the user has already seen reads as idle', () => {
    expect(toPaneActivity({ state: 'running' }, 'done', false)).toBe('done')
    expect(toPaneActivity({ state: 'running' }, 'done', true)).toBe('idle')
  })

  test('process failures win over agent status', () => {
    expect(toPaneActivity({ state: 'exited', exit: { exitCode: 1 } }, 'working', false)).toBe(
      'exited',
    )
    expect(toPaneActivity({ state: 'error', message: 'x' }, null, false)).toBe('error')
  })
})

describe('projectAttention', () => {
  test('surfaces the most urgent activity across panes', () => {
    const all: PaneActivity[] = ['idle', 'working', 'done', 'needs-input']
    expect(projectAttention(all)).toBe('needs-input')
    expect(projectAttention(['idle', 'done', 'working'])).toBe('done')
    expect(projectAttention(['idle', 'working'])).toBe('working')
  })

  test('returns null when nothing needs showing', () => {
    expect(projectAttention([])).toBeNull()
    expect(projectAttention(['idle', 'running', 'exited'])).toBeNull()
  })
})
