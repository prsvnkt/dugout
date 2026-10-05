import { IpcChannel } from '@shared/ipc/channels'
import { gitProjectRequestSchema, worktreeRemoveRequestSchema } from '@shared/ipc/contract'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

export function registerWorktreeIpc(projects: ProjectStore, worktrees: WorktreeManager): void {
  handleRequest(IpcChannel.worktreeList, gitProjectRequestSchema, ({ projectId }) =>
    worktrees.list(findProject(projects, projectId)),
  )
  handleRequest(IpcChannel.worktreeCreate, gitProjectRequestSchema, ({ projectId }) =>
    worktrees.create(findProject(projects, projectId)),
  )
  handleRequest(IpcChannel.worktreeRemove, worktreeRemoveRequestSchema, ({ projectId, path }) =>
    worktrees.remove(findProject(projects, projectId), path),
  )
}
