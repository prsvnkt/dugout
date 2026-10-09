import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { readLinesFrom } from './jsonlTail'

const TRANSCRIPT_EXTENSION = '.jsonl'
/** Session ids name files, so only plain ids are looked up (they are UUIDs in practice). */
const SESSION_ID = /^[A-Za-z0-9][\w-]{0,127}$/
/** Codex nests logs by date (`sessions/YYYY/MM/DD/`); deeper folders are not searched. */
const CODEX_MAX_DEPTH = 4

/**
 * The transcript's real path if it is a `.jsonl` file inside `root` (symlinks resolved), else
 * null. Paths come from hook payloads or a search, so a path is never read just because it exists.
 */
export async function allowedPath(path: string, root: string): Promise<string | null> {
  if (!isAbsolute(path) || !path.endsWith(TRANSCRIPT_EXTENSION)) return null
  const [real, realRoot] = await Promise.all([
    realpath(path).catch(() => null),
    realpath(root).catch(() => null),
  ])
  if (!real || !realRoot || !real.endsWith(TRANSCRIPT_EXTENSION)) return null
  return real.startsWith(realRoot + sep) ? real : null
}

async function folders(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() === true
}

/** Claude Code keeps a session at `<root>/projects/<cwd as a folder name>/<session id>.jsonl`. */
export async function findClaudeTranscript(
  root: string,
  sessionId: string,
): Promise<string | null> {
  if (!SESSION_ID.test(sessionId)) return null
  const projects = join(root, 'projects')
  for (const name of await folders(projects)) {
    const candidate = join(projects, name, `${sessionId}${TRANSCRIPT_EXTENSION}`)
    if (await isFile(candidate)) return candidate
  }
  return null
}

async function findNamed(dir: string, suffix: string, depth: number): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const file = entries.find((entry) => entry.isFile() && entry.name.endsWith(suffix))
  if (file) return join(dir, file.name)
  if (depth === 0) return null
  // Newest dates first: the session asked for is most likely recent.
  const subfolders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  for (const name of subfolders.sort().reverse()) {
    const found = await findNamed(join(dir, name), suffix, depth - 1)
    if (found) return found
  }
  return null
}

/** Codex keeps a session at `<root>/sessions/YYYY/MM/DD/rollout-<time>-<session id>.jsonl`. */
export async function findCodexTranscript(root: string, sessionId: string): Promise<string | null> {
  if (!SESSION_ID.test(sessionId)) return null
  return findNamed(join(root, 'sessions'), `${sessionId}${TRANSCRIPT_EXTENSION}`, CODEX_MAX_DEPTH)
}

/**
 * The complete lines in the last `maxBytes` of a transcript. A long session is read from the end
 * (its latest steps); the first line there is cut, so it is dropped, and `isCut` says so.
 */
export async function readTranscriptTail(
  path: string,
  maxBytes: number,
): Promise<{ lines: readonly string[]; isCut: boolean }> {
  const { size } = await stat(path)
  const start = Math.max(0, size - maxBytes)
  const { lines } = await readLinesFrom(path, start)
  return start === 0 ? { lines, isCut: false } : { lines: lines.slice(1), isCut: true }
}
