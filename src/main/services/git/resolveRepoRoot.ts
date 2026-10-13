import { runGit } from './runGit'

const GIT_TIMEOUT_MS = 5_000

/** Absolute path of the git repository containing `path`, or null if it is not in one. */
export async function resolveRepoRoot(path: string): Promise<string | null> {
  try {
    const { stdout } = await runGit({
      cwd: path,
      args: ['rev-parse', '--show-toplevel'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      timeoutMs: GIT_TIMEOUT_MS,
    })
    const root = stdout.trim()
    return root.length > 0 ? root : null
  } catch {
    // Not a repository, missing folder or git unavailable: all mean "no repo root".
    return null
  }
}
