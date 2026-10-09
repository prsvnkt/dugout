import type { TerminalId } from '@shared/terminal'
import { dugout } from '@renderer/lib/dugout'

/**
 * Lets other features type into a running terminal as if the user pasted: `useTerminal`
 * registers each connected xterm, so text goes through xterm's paste (bracketed when the agent
 * asked for it) instead of raw bytes.
 */
const pasters = new Map<TerminalId, (text: string) => void>()

/** Returns the function that unregisters it. */
export function registerPaste(terminalId: TerminalId, paste: (text: string) => void): () => void {
  pasters.set(terminalId, paste)
  return () => {
    if (pasters.get(terminalId) === paste) pasters.delete(terminalId)
  }
}

/**
 * Agent TUIs treat Enter that arrives with a paste as part of it; a moment later it submits.
 */
const SUBMIT_DELAY_MS = 150

/** Pastes a prompt into an agent's terminal and submits it. False if the terminal is gone. */
export function sendPrompt(terminalId: TerminalId, prompt: string): boolean {
  const paste = pasters.get(terminalId)
  if (!paste) return false
  paste(prompt)
  // Not cancelled if the pane closes first: main ignores writes to terminals it no longer has.
  setTimeout(() => dugout.terminal.write(terminalId, '\r'), SUBMIT_DELAY_MS)
  return true
}
