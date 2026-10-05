import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 5_000

/** Absolute path of the git repository containing `path`, or null if it is not in one. */
export async function resolveRepoRoot(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path,
      timeout: GIT_TIMEOUT_MS,
    })
    const root = stdout.trim()
    return root.length > 0 ? root : null
  } catch {
    // Not a repository, missing folder or git unavailable: all mean "no repo root".
    return null
  }
}
