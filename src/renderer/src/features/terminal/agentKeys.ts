/**
 * Line feed (what Ctrl+J sends). Claude Code and Codex both read it as "new line" rather than
 * "submit", which is how Shift+Enter behaves in their own terminal setups.
 */
export const AGENT_NEWLINE = '\n'

/**
 * xterm encodes Shift+Enter exactly like Enter (`\r`), so agents cannot tell them apart.
 * Returns the bytes to send instead for keys agent terminals remap, or null to let xterm
 * handle the key as usual.
 */
export function agentKeyOverride(event: KeyboardEvent): string | null {
  const isShiftEnter =
    event.key === 'Enter' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
  if (event.type !== 'keydown' || event.isComposing || !isShiftEnter) return null
  return AGENT_NEWLINE
}
