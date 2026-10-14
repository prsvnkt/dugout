/**
 * OSC 52 (`ESC ] 52 ; Pc ; Pd BEL`) is how TUIs with mouse tracking on, such as Claude Code,
 * copy their own selection: `Pc` names clipboards, `Pd` is the text in base64. Only writes are
 * honoured: `?` (read the clipboard) is ignored, so a program can never read it (decision 066).
 */

/** About 1 MB of base64 (768 KB of text); anything larger is dropped rather than decoded. */
export const MAX_OSC52_BASE64_LENGTH = 1024 * 1024

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** The text an OSC 52 payload (`Pc;Pd`) copies, or null for reads, clears and bad payloads. */
export function parseOsc52Copy(payload: string): string | null {
  const separator = payload.indexOf(';')
  if (separator < 0) return null
  const data = payload.slice(separator + 1)
  if (data === '' || data.length > MAX_OSC52_BASE64_LENGTH) return null
  if (data.length % 4 !== 0 || !BASE64.test(data)) return null
  try {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    return utf8.decode(bytes)
  } catch {
    return null
  }
}
