import type { HookSignal } from '@shared/agentStatus'

export interface HookBinding {
  readonly event: string
  readonly signal: HookSignal
  readonly matcher?: string
}

/** Which Claude Code hook events drive which status signal. */
export const HOOK_BINDINGS: readonly HookBinding[] = [
  { event: 'SessionStart', signal: 'ready' },
  { event: 'UserPromptSubmit', signal: 'working' },
  { event: 'PostToolUse', signal: 'working' },
  { event: 'PermissionRequest', signal: 'needs-input' },
  {
    event: 'Notification',
    signal: 'needs-input',
    matcher: 'permission_prompt|elicitation_dialog|agent_needs_input',
  },
  { event: 'Stop', signal: 'done' },
  { event: 'StopFailure', signal: 'done' },
]

const CURL_TIMEOUT_SECONDS = 2

interface CommandHook {
  readonly type: 'command'
  readonly command: string
  readonly async: true
}

interface HookGroup {
  readonly matcher?: string
  readonly hooks: readonly CommandHook[]
}

export interface HookSettings {
  readonly hooks: Readonly<Record<string, readonly HookGroup[]>>
  readonly permissions: { readonly allow: readonly string[] }
}

/** Dugout's own MCP tools only touch the project's tasks, so agents may use them freely. */
const ALLOWED_TOOLS = ['mcp__dugout']

/**
 * A shell command that tells the app about `signal`. It is a no-op outside Dugout terminals,
 * runs async, times out quickly and always succeeds, so it can never disturb Claude.
 */
/**
 * Signals that forward the hook's JSON payload (stdin): the session id (ready), what the agent
 * is asking (needs-input) and its last message (done). Frequent ones (working) send nothing.
 */
const FORWARDS_PAYLOAD: ReadonlySet<HookSignal> = new Set(['ready', 'needs-input', 'done'])

function signalCommand(signal: HookSignal): string {
  return [
    '[ -n "$DUGOUT_TERMINAL_ID" ] &&',
    `curl -s -X POST --max-time ${CURL_TIMEOUT_SECONDS}`,
    ...(FORWARDS_PAYLOAD.has(signal) ? ['--data-binary @-'] : []),
    '--unix-socket "$DUGOUT_HOOK_SOCKET"',
    '-H "Authorization: Bearer $DUGOUT_HOOK_TOKEN"',
    `"http://dugout/hooks/$DUGOUT_TERMINAL_ID/${signal}"`,
    '>/dev/null 2>&1 || true',
  ].join(' ')
}

/** The settings file passed to every Claude terminal with `claude --settings`. */
export function buildHookSettings(): HookSettings {
  const hooks: Record<string, HookGroup[]> = {}
  for (const { event, signal, matcher } of HOOK_BINDINGS) {
    const group: HookGroup = {
      ...(matcher !== undefined && { matcher }),
      hooks: [{ type: 'command', command: signalCommand(signal), async: true }],
    }
    hooks[event] = [...(hooks[event] ?? []), group]
  }
  return { hooks, permissions: { allow: ALLOWED_TOOLS } }
}
