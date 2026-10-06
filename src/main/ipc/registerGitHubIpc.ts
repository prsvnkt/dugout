import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitHubApi } from '../services/github/GitHubApi'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import { handleRequest } from './handle'

export interface GitHubIpcDeps {
  readonly auth: GitHubAuth
  readonly api: GitHubApi
  readonly webBaseUrl: string
  readonly openExternal: (url: string) => Promise<void>
}

/** Sign-in and repository listing. The token stays in main; the renderer sees only state. */
export function registerGitHubIpc({ auth, api, webBaseUrl, openExternal }: GitHubIpcDeps): void {
  handleRequest(IpcChannel.authGetState, z.undefined(), () => auth.state())
  handleRequest(IpcChannel.authStart, z.undefined(), () => auth.startSignIn())
  handleRequest(IpcChannel.authCancel, z.undefined(), () => auth.cancelSignIn())
  handleRequest(IpcChannel.authSignOut, z.undefined(), () => auth.signOut())
  handleRequest(IpcChannel.authRetry, z.undefined(), () => auth.retryNow())

  // Opens only the verification page GitHub itself returned, and only on the GitHub host.
  handleRequest(IpcChannel.authOpenVerification, z.undefined(), async () => {
    const state = auth.state()
    if (state.status !== 'pending') throw new Error('No sign-in in progress.')
    const url = new URL(state.prompt.verificationUri)
    if (url.origin !== new URL(webBaseUrl).origin) throw new Error('Unexpected sign-in page.')
    await openExternal(url.toString())
  })

  handleRequest(IpcChannel.githubListRepos, z.undefined(), () =>
    auth.withToken((token) => api.listRepos(token)),
  )
}
