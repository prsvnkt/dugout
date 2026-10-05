import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AgentNotifier, type AgentNotification } from './AgentNotifier'

function setup(isAppFocused = false) {
  const shown: AgentNotification[] = []
  const focus = { value: isAppFocused }
  const notifier = new AgentNotifier({
    isAppFocused: () => focus.value,
    projectName: (id) => (id === 'p1' ? 'Bene' : undefined),
    show: (notification) => shown.push(notification),
  })
  return { notifier, shown, focus }
}

describe('AgentNotifier', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup()
  })

  test('notifies when an agent needs the user while the app is in the background', () => {
    ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', status: 'needs-input' })
    expect(ctx.shown).toEqual([
      { terminalId: 't1', title: 'Bene', body: 'Claude needs your input.' },
    ])
  })

  test('notifies when an agent finishes a turn', () => {
    ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', status: 'done' })
    expect(ctx.shown[0]?.body).toBe('Claude finished and is ready for review.')
  })

  test('stays quiet while the app is focused; the UI already shows it', () => {
    ctx.focus.value = true
    ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', status: 'needs-input' })
    expect(ctx.shown).toEqual([])
  })

  test('ignores statuses that do not need attention', () => {
    for (const status of ['starting', 'idle', 'working', null] as const) {
      ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', status })
    }
    expect(ctx.shown).toEqual([])
  })

  test('falls back to a generic title for unknown projects', () => {
    ctx.notifier.handle({ terminalId: 't1', projectId: 'gone', status: 'done' })
    expect(ctx.shown[0]?.title).toBe('Dugout')
  })

  test('never lets a notification failure escape', () => {
    const { notifier } = {
      notifier: new AgentNotifier({
        isAppFocused: () => false,
        projectName: () => 'Bene',
        show: () => {
          throw new Error('notifications unavailable')
        },
      }),
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      notifier.handle({ terminalId: 't1', projectId: 'p1', status: 'done' }),
    ).not.toThrow()
    error.mockRestore()
  })
})
