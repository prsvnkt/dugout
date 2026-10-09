import { IpcChannel } from '@shared/ipc/channels'
import {
  gitProjectRequestSchema,
  previewAssignPortRequestSchema,
  previewOpenUrlRequestSchema,
} from '@shared/ipc/contract'
import type { PreviewDeployment } from '@shared/preview'
import type { GitHubDeployments } from '../services/github/GitHubDeployments'
import { KnownPreviewUrls, openablePreviewUrl } from '../services/preview/openableUrl'
import { candidatePorts, findFreePort } from '../services/preview/ports'
import { resolveGitHubBranch, type GitHubBranchDeps } from './githubBranch'
import { handleRequest } from './handle'

export interface PreviewIpcDeps extends GitHubBranchDeps {
  readonly deployments: GitHubDeployments
  readonly isPortFree: (port: number) => Promise<boolean>
  readonly openExternal: (url: string) => Promise<void>
}

export function registerPreviewIpc(deps: PreviewIpcDeps): void {
  const known = new KnownPreviewUrls()

  /** The checkout branch's preview deployment; null when there is none to show. */
  handleRequest(
    IpcChannel.previewDeployment,
    gitProjectRequestSchema,
    async (request): Promise<PreviewDeployment | null> => {
      const target = await resolveGitHubBranch(deps, request)
      if (!target) return null
      const preview = await deps.auth.withToken((token) =>
        deps.deployments.forBranch(token, target.repo, target.branch),
      )
      if (preview?.url) known.remember(preview.url)
      return preview
    },
  )

  handleRequest(IpcChannel.previewAssignPort, previewAssignPortRequestSchema, ({ reserved }) =>
    findFreePort(candidatePorts(reserved), deps.isPortFree),
  )

  // Only previews main reported and local dev servers: never an arbitrary renderer URL.
  handleRequest(IpcChannel.previewOpenUrl, previewOpenUrlRequestSchema, async ({ url }) => {
    const openable = openablePreviewUrl(url, known)
    if (!openable) throw new Error('Only preview and dev server links can be opened.')
    await deps.openExternal(openable)
  })
}
