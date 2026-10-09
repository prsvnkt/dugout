import { describe, expect, test } from 'vitest'
import type { HookDetails } from './HookServer'
import { NO_APPROVALS, trackApprovals, type PendingApproval } from './pendingApprovals'

const preview = (command: string) =>
  ({ kind: 'command', tool: 'Bash', command, description: null }) as const

/** PermissionRequest: neither CLI sends a tool id with it. */
const ask = (command: string): HookDetails => ({
  toolCall: { toolUseId: null, key: `Bash\u0000${command}` },
  preview: preview(command),
  detail: `Bash: ${command}`,
})

/** PostToolUse / PostToolUseFailure: always carries the tool id. */
const finished = (command: string, id: string): HookDetails => ({
  toolCall: { toolUseId: id, key: `Bash\u0000${command}` },
})

function run(...steps: [Parameters<typeof trackApprovals>[1], HookDetails][]) {
  return steps.reduce<readonly PendingApproval[]>(
    (pending, [signal, details]) => trackApprovals(pending, signal, details),
    NO_APPROVALS,
  )
}

const commands = (pending: readonly PendingApproval[]) =>
  pending.map((approval) => (approval.preview.kind === 'command' ? approval.preview.command : ''))

describe('trackApprovals', () => {
  test('a permission request is pending until its tool finishes', () => {
    const asked = run(['needs-input', ask('npm install')])
    expect(commands(asked)).toEqual(['npm install'])
    expect(asked[0]?.detail).toBe('Bash: npm install')

    expect(trackApprovals(asked, 'tool-done', finished('npm install', 't1'))).toEqual([])
  })

  test('a parallel tool that needed no approval does not clear a pending one', () => {
    const pending = run(['needs-input', ask('npm install')], ['tool-done', finished('ls', 't0')])
    expect(commands(pending)).toEqual(['npm install'])
  })

  test('two parallel approvals stay pending until both tools finish, in any order', () => {
    const both = run(['needs-input', ask('npm install')], ['needs-input', ask('npm test')])
    expect(commands(both)).toEqual(['npm install', 'npm test'])

    const afterSecond = trackApprovals(both, 'tool-done', finished('npm test', 't2'))
    expect(commands(afterSecond)).toEqual(['npm install'])
    expect(trackApprovals(afterSecond, 'tool-done', finished('npm install', 't1'))).toEqual([])
  })

  test('identical parallel calls each need their own finish', () => {
    const twice = run(
      ['needs-input', ask('npm test')],
      ['needs-input', ask('npm test')],
      ['tool-done', finished('npm test', 't1')],
    )
    expect(commands(twice)).toEqual(['npm test'])
  })

  test('matches by tool id when the request carried one', () => {
    const withId: HookDetails = {
      ...ask('npm test'),
      toolCall: { toolUseId: 't9', key: 'Bash\u0000npm test' },
    }
    const pending = run(
      ['needs-input', withId],
      ['needs-input', ask('npm test')],
      ['tool-done', finished('npm test', 't9')],
    )
    expect(pending).toHaveLength(1)
    expect(pending[0]?.toolCall.toolUseId).toBeNull()
  })

  test('a finished tool we cannot identify changes nothing', () => {
    const pending = run(['needs-input', ask('npm install')], ['tool-done', {}])
    expect(commands(pending)).toEqual(['npm install'])
  })

  test.each(['working', 'done', 'ready'] as const)(
    'a new prompt, the end of the turn or a new session (%s) clears every approval',
    (signal) => {
      const pending = run(['needs-input', ask('a')], ['needs-input', ask('b')])
      expect(trackApprovals(pending, signal, {})).toEqual([])
    },
  )

  test('a notification without a tool call keeps the pending approvals', () => {
    const pending = run(['needs-input', ask('a')])
    expect(trackApprovals(pending, 'needs-input', { detail: 'Claude needs your permission' })).toBe(
      pending,
    )
  })

  test('returns the same list when nothing changes', () => {
    expect(trackApprovals(NO_APPROVALS, 'tool-done', finished('ls', 't1'))).toBe(NO_APPROVALS)
    expect(trackApprovals(NO_APPROVALS, 'done', {})).toBe(NO_APPROVALS)
  })
})
