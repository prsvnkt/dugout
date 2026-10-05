import { IpcChannel } from '@shared/ipc/channels'
import {
  filesReadDirRequestSchema,
  filesReadRequestSchema,
  filesStatRequestSchema,
  filesWriteRequestSchema,
} from '@shared/ipc/contract'
import type { FileService } from '../services/files/FileService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

/** File access is addressed by project (and worktree); main resolves and validates the root. */
export function registerFileIpc(
  projects: ProjectStore,
  worktrees: WorktreeManager,
  files: FileService,
): void {
  const rootOf = (request: { projectId: string; worktreePath?: string | undefined }) =>
    worktrees.resolveCheckout(findProject(projects, request.projectId), request.worktreePath)

  handleRequest(IpcChannel.filesReadDir, filesReadDirRequestSchema, async (request) =>
    files.readDir(await rootOf(request), request.path),
  )
  handleRequest(IpcChannel.filesRead, filesReadRequestSchema, async (request) =>
    files.readFile(await rootOf(request), request.path),
  )
  handleRequest(IpcChannel.filesStat, filesStatRequestSchema, async (request) =>
    files.stat(await rootOf(request), request.paths),
  )
  handleRequest(IpcChannel.filesWrite, filesWriteRequestSchema, async (request) =>
    files.writeFile(await rootOf(request), request.path, request.content, {
      expectedMtimeMs: request.expectedMtimeMs,
      force: request.force,
    }),
  )
}
