import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { openInRequestSchema } from '@shared/ipc/contract'
import type { OpenInService } from '../services/openIn/OpenInService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest, type IpcMainLike } from './handle'
import { findProject } from './registerGitIpc'

export function registerOpenInIpc(
  projects: ProjectStore,
  worktrees: WorktreeManager,
  openIn: OpenInService,
  ipc?: IpcMainLike,
): void {
  handleRequest(IpcChannel.openInApps, z.undefined(), () => openIn.apps(), ipc)
  // The renderer names a checkout, never a free path: the project root or a managed worktree.
  handleRequest(
    IpcChannel.openInOpen,
    openInRequestSchema,
    async (request) => {
      const project = findProject(projects, request.projectId)
      const folder = await worktrees.resolveCheckout(project, request.worktreePath)
      await openIn.open(request.app, folder)
    },
    ipc,
  )
}
