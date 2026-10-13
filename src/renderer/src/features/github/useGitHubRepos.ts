import type { GitHubRepo } from '@shared/github'
import { dugout } from '@renderer/lib/dugout'
import { useRequest, type RequestState } from '@renderer/lib/useRequest'

export type RepoListState = RequestState<readonly GitHubRepo[]>

/** The signed-in user's GitHub repositories (the welcome screen and the clone dialog). */
export function useGitHubRepos(): RepoListState {
  return useRequest(() => dugout.github.listRepos(), [])
}
