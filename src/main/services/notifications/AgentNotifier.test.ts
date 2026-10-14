import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AGENT_LIST } from '@shared/agents'
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
    ctx.notifier.handle({
      terminalId: 't1',
      projectId: 'p1',
      agentKind: 'claude',
      status: 'needs-input',
    })
    expect(ctx.shown).toEqual([
      { terminalId: 't1', title: 'Bene', body: 'Claude needs your input.' },
    ])
  })

  test('notifies when an agent finishes a turn', () => {
    ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', agentKind: 'claude', status: 'done' })
    expect(ctx.shown[0]?.body).toBe('Claude finished and is ready for review.')
  })

  test.each(AGENT_LIST)('names the $label agent in the fallback text', (agent) => {
    ctx.notifier.handle({
      terminalId: 't1',
      projectId: 'p1',
      agentKind: agent.kind,
      status: 'done',
    })
    ctx.notifier.handle({
      terminalId: 't2',
      projectId: 'p1',
      agentKind: agent.kind,
      status: 'needs-input',
    })
    expect(ctx.shown.map((shown) => shown.body)).toEqual([
      `${agent.label} finished and is ready for review.`,
      `${agent.label} needs your input.`,
    ])
  })

  test('prefers the detail the hook sent', () => {
    ctx.notifier.handle({
      terminalId: 't1',
      projectId: 'p1',
      agentKind: 'codex',
      status: 'needs-input',
      detail: 'Approve the build command?',
    })
    expect(ctx.shown[0]?.body).toBe('Approve the build command?')
  })

  test('stays quiet while the app is focused; the UI already shows it', () => {
    ctx.focus.value = true
    ctx.notifier.handle({
      terminalId: 't1',
      projectId: 'p1',
      agentKind: 'claude',
      status: 'needs-input',
    })
    expect(ctx.shown).toEqual([])
  })

  test('ignores statuses that do not need attention', () => {
    for (const status of ['starting', 'idle', 'working', null] as const) {
      ctx.notifier.handle({ terminalId: 't1', projectId: 'p1', agentKind: 'claude', status })
    }
    expect(ctx.shown).toEqual([])
  })

  test('falls back to a generic title for unknown projects', () => {
    ctx.notifier.handle({
      terminalId: 't1',
      projectId: 'gone',
      agentKind: 'claude',
      status: 'done',
    })
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
      notifier.handle({ terminalId: 't1', projectId: 'p1', agentKind: 'claude', status: 'done' }),
    ).not.toThrow()
    error.mockRestore()
  })
})
