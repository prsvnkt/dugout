import { execFile } from 'node:child_process'

/** `open` returns as soon as Launch Services has the request; it never waits for the app. */
const OPEN_TIMEOUT_MS = 15_000

/** macOS `open`. Tests point Dugout at a stand-in through DUGOUT_OPEN_COMMAND. */
export const DEFAULT_OPEN_COMMAND = '/usr/bin/open'

/** Runs `command` with `args` as separate arguments (no shell), rejecting on failure. */
export function execFileRunner(command: string): (args: readonly string[]) => Promise<void> {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(command, [...args], { timeout: OPEN_TIMEOUT_MS }, (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr.trim() || error.message))
        else resolve()
      })
    })
}
