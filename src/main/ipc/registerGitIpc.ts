import { IpcChannel } from '@shared/ipc/channels'
import {
  gitCommitRequestSchema,
  gitDiffRequestSchema,
  gitPathsRequestSchema,
  gitProjectRequestSchema,
} from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import type { GitService } from '../services/git/GitService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest } from './handle'

/**
 * The renderer names a project, never a folder: main resolves the repository path itself,
 * so the UI cannot run git anywhere outside the user's projects.
 */
export function registerGitIpc(projects: ProjectStore, git: GitService): void {
  const rootOf = (projectId: ProjectId): string => {
    const project = projects.list().find((candidate) => candidate.id === projectId)
    if (!project) throw new Error('Project not found.')
    return project.rootPath
  }

  handleRequest(IpcChannel.gitStatus, gitProjectRequestSchema, ({ projectId }) =>
    git.status(rootOf(projectId)),
  )
  handleRequest(IpcChannel.gitDiff, gitDiffRequestSchema, ({ projectId, ...request }) =>
    git.diff(rootOf(projectId), request),
  )
  handleRequest(IpcChannel.gitStage, gitPathsRequestSchema, ({ projectId, paths }) =>
    git.stage(rootOf(projectId), paths),
  )
  handleRequest(IpcChannel.gitUnstage, gitPathsRequestSchema, ({ projectId, paths }) =>
    git.unstage(rootOf(projectId), paths),
  )
  handleRequest(IpcChannel.gitDiscard, gitPathsRequestSchema, ({ projectId, paths }) =>
    git.discard(rootOf(projectId), paths),
  )
  handleRequest(IpcChannel.gitCommit, gitCommitRequestSchema, ({ projectId, message }) =>
    git.commit(rootOf(projectId), message),
  )
  handleRequest(IpcChannel.gitPush, gitProjectRequestSchema, ({ projectId }) =>
    git.push(rootOf(projectId)),
  )
}
