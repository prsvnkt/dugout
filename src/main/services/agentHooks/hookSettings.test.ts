import { describe, expect, test } from 'vitest'
import { buildHookSettings, HOOK_BINDINGS } from './hookSettings'

describe('HOOK_BINDINGS', () => {
  test('maps the Claude Code lifecycle onto status signals', () => {
    const signalFor = (event: string) => HOOK_BINDINGS.find((b) => b.event === event)?.signal
    expect(signalFor('SessionStart')).toBe('ready')
    expect(signalFor('UserPromptSubmit')).toBe('working')
    expect(signalFor('PostToolUse')).toBe('working')
    expect(signalFor('PermissionRequest')).toBe('needs-input')
    expect(signalFor('Stop')).toBe('done')
  })

  test('only permission-style notifications count as needing the user', () => {
    const notification = HOOK_BINDINGS.find((b) => b.event === 'Notification')
    expect(notification?.matcher).toBe('permission_prompt|elicitation_dialog|agent_needs_input')
  })
})

describe('buildHookSettings', () => {
  const settings = buildHookSettings()

  test('registers every binding as an async command hook', () => {
    for (const binding of HOOK_BINDINGS) {
      const groups = settings.hooks[binding.event]
      expect(groups, binding.event).toBeDefined()
      const hook = groups?.[0]?.hooks[0]
      expect(hook).toMatchObject({ type: 'command', async: true })
    }
  })

  test('hook commands read the socket, token and terminal id from the environment', () => {
    const command = settings.hooks.Stop?.[0]?.hooks[0]?.command ?? ''
    expect(command).toContain('--unix-socket "$DUGOUT_HOOK_SOCKET"')
    expect(command).toContain('Authorization: Bearer $DUGOUT_HOOK_TOKEN')
    expect(command).toContain('/hooks/$DUGOUT_TERMINAL_ID/done')
  })

  test('hook commands never fail or block Claude', () => {
    const command = settings.hooks.Stop?.[0]?.hooks[0]?.command ?? ''
    expect(command).toContain('--max-time')
    expect(command).toMatch(/\|\| true$/)
  })

  test('ready, needs-input and done forward the payload (session id, what is asked, summary)', () => {
    const command = (event: string) => settings.hooks[event]?.[0]?.hooks[0]?.command ?? ''
    expect(command('SessionStart')).toContain('--data-binary @-')
    expect(command('PermissionRequest')).toContain('--data-binary @-')
    expect(command('Stop')).toContain('--data-binary @-')
    expect(command('PostToolUse')).not.toContain('--data-binary')
  })

  test("pre-approves Dugout's own task tools", () => {
    expect(settings.permissions.allow).toEqual(['mcp__dugout'])
  })

  test('does nothing outside a Dugout terminal', () => {
    const command = settings.hooks.Stop?.[0]?.hooks[0]?.command ?? ''
    expect(command).toMatch(/^\[ -n "\$DUGOUT_TERMINAL_ID" \] &&/)
  })
})
