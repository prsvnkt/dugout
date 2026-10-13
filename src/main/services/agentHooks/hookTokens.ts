import { randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_BYTES = 32

/** What `TerminalManager` needs: a token for each agent terminal it starts, dropped on exit. */
export interface HookTokenIssuer {
  issue(terminalId: string): string
  revoke(terminalId: string): void
}

/** What the hook server needs: does this Authorization header belong to this terminal? */
export interface HookAuthorizer {
  isAuthorized(terminalId: string, header: string | undefined): boolean
}

/**
 * One random bearer token per agent terminal (decision 059). A token authorizes only requests
 * for its own terminal id, so one terminal's agent cannot act on another terminal's project or
 * spoof its status. Tokens live only in main's memory and are forgotten when the terminal exits.
 */
export class HookTokens implements HookTokenIssuer, HookAuthorizer {
  /** The expected `Authorization` header per terminal. */
  private readonly expected = new Map<string, Buffer>()

  /** A fresh token for the terminal, replacing any earlier one. */
  issue(terminalId: string): string {
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    this.expected.set(terminalId, Buffer.from(`Bearer ${token}`))
    return token
  }

  revoke(terminalId: string): void {
    this.expected.delete(terminalId)
  }

  isAuthorized(terminalId: string, header: string | undefined): boolean {
    const expected = this.expected.get(terminalId)
    if (!expected || !header) return false
    const actual = Buffer.from(header)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
