import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { FileService } from '../services/files/FileService'
import { GitService } from '../services/git/GitService'
import { gitCredentialConfig } from '../services/github/gitCredentials'
import { WorktreeManager } from '../services/worktrees/WorktreeManager'
import type { AppEnv } from './appEnv'
import type { GithubServices } from './composeGithub'

const WORKTREES_DIR = 'worktrees'
const WORKTREE_ID_BYTES = 3

export interface GitServices {
  readonly git: GitService
  readonly files: FileService
  readonly worktrees: WorktreeManager
}

/** Git (with the GitHub token as credentials), checkout file access and worktrees. */
export function composeGit(env: AppEnv, github: GithubServices): GitServices {
  const git = new GitService({
    env: process.env,
    credentials: async () =>
      gitCredentialConfig(
        await github.auth.freshToken().catch(() => null),
        github.config.webBaseUrl,
      ),
  })
  const files = new FileService({ git })
  const worktrees = new WorktreeManager({
    git,
    files,
    baseDir: join(env.dataDir, WORKTREES_DIR),
    createId: () => randomBytes(WORKTREE_ID_BYTES).toString('hex'),
  })
  return { git, files, worktrees }
}
