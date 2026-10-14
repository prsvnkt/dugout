import { chmodSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HookTokenIssuer, HookTokens } from './hookTokens'

const OWNER_ONLY = 0o600
const OWNER_ONLY_DIR = 0o700

/** An empty owner-only folder: header files from an earlier run hold dead tokens. */
function freshPrivateDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true, mode: OWNER_ONLY_DIR })
  if (!lstatSync(dir).isDirectory()) throw new Error(`${dir} is not a folder.`)
  chmodSync(dir, OWNER_ONLY_DIR)
}

/**
 * Issues hook tokens and writes each terminal's `Authorization` header to `<dir>/<terminalId>`,
 * which hook commands pass to curl as `-H @file`, so the token never sits on curl's command line
 * (where `ps` shows it). The file goes when the terminal exits.
 */
export function hookHeaderIssuer(tokens: HookTokens, dir: string): HookTokenIssuer {
  freshPrivateDir(dir)
  const fileOf = (terminalId: string) => join(dir, terminalId)
  return {
    issue(terminalId) {
      const token = tokens.issue(terminalId)
      const headerFile = fileOf(terminalId)
      writeFileSync(headerFile, `Authorization: Bearer ${token}\n`, { mode: OWNER_ONLY })
      chmodSync(headerFile, OWNER_ONLY)
      return { token, headerFile }
    },
    revoke(terminalId) {
      tokens.revoke(terminalId)
      rmSync(fileOf(terminalId), { force: true })
    },
  }
}
