import { protocol } from 'electron'
import { FILE_SCHEME } from '@shared/viewers'
import { findProject } from '../ipc/registerGitIpc'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { createFileProtocolHandler } from '../services/viewers/fileProtocol'
import type { GitServices } from './composeGit'

/**
 * Makes `dugout-file:` a standard, secure scheme that `fetch` and media streaming work with
 * (decision 067). Electron only accepts this before the app is ready, so `index.ts` calls it
 * at load time.
 */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FILE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

/** Serves checkout media files to the editor's viewers, through FileService. */
export function serveFileProtocol(projects: ProjectStore, repo: GitServices): void {
  protocol.handle(
    FILE_SCHEME,
    createFileProtocolHandler({
      resolveRoot: async (checkout) =>
        repo.worktrees.resolveCheckout(
          findProject(projects, checkout.projectId),
          checkout.worktreePath,
        ),
      files: repo.files,
      warn: (message) => console.warn(message),
    }),
  )
}
