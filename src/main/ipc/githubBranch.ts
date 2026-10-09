import type { GitProjectRequest } from '@shared/ipc/contract'
import type { GitService } from '../services/git/GitService'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { githubRepoFromRemote, type GitHubRepoRef } from '../services/tasks/githubRepo'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { findProject } from './registerGitIpc'

export interface GitHubBranchDeps {
  readonly projects: ProjectStore
  readonly worktrees: WorktreeManager
  readonly git: GitService
  readonly auth: GitHubAuth
  readonly webBaseUrl: string
}

/** A checkout's branch on its GitHub remote. */
export interface GitHubBranch {
  readonly repo: GitHubRepoRef
  readonly branch: string
}

/** The checkout's branch on GitHub; null when signed out, detached or not on a GitHub remote. */
export async function resolveGitHubBranch(
  deps: GitHubBranchDeps,
  request: GitProjectRequest,
): Promise<GitHubBranch | null> {
  const project = findProject(deps.projects, request.projectId)
  const root = await deps.worktrees.resolveCheckout(project, request.worktreePath)
  const status = await deps.git.status(root)
  const remote = await deps.git.remoteUrl(root)
  const repo = remote ? githubRepoFromRemote(remote, deps.webBaseUrl) : null
  if (!status.branch || !repo || !(await deps.auth.freshToken())) return null
  return { repo, branch: status.branch }
}
