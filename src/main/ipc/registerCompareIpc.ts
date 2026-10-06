import { IpcChannel } from '@shared/ipc/channels'
import { compareChangesRequestSchema } from '@shared/ipc/contract'
import type { WorktreeChanges } from '@shared/compare'
import type { GitService } from '../services/git/GitService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

const FALLBACK_BASE = 'main'

/** What each worktree changed since its branch left the base branch, for the Compare view. */
export function registerCompareIpc(
  projects: ProjectStore,
  worktrees: WorktreeManager,
  git: GitService,
) {
  handleRequest(
    IpcChannel.compareChanges,
    compareChangesRequestSchema,
    async ({ projectId, worktreePaths }): Promise<WorktreeChanges[]> => {
      const project = findProject(projects, projectId)
      return Promise.all(
        worktreePaths.map(async (worktreePath) => {
          const root = await worktrees.resolveCheckout(project, worktreePath)
          const base = (await git.status(project.rootPath)).baseBranch ?? FALLBACK_BASE
          return { worktreePath, changes: await git.changesSince(root, base) }
        }),
      )
    },
  )
}
