import type { GitHubRepo } from '@shared/github'
import type { LocalRepo } from '@shared/welcome'

/** Both searches' results as one list: each repo once, most recently changed first. */
export function mergeLocalRepos(
  current: readonly LocalRepo[],
  more: readonly LocalRepo[],
): LocalRepo[] {
  const byPath = new Map([...current, ...more].map((repo) => [repo.path, repo]))
  return [...byPath.values()].sort((a, b) => b.modifiedAt - a.modifiedAt)
}

/** "Developer" for /Users/me/Developer/app: enough to tell same-named repos apart. */
export function parentFolderName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts.at(-2) ?? '/'
}

/** The repos pushed to most recently; repos never pushed go last. */
export function recentlyPushed(repos: readonly GitHubRepo[], count: number): GitHubRepo[] {
  const time = (repo: GitHubRepo) => (repo.pushedAt ? Date.parse(repo.pushedAt) : 0)
  return [...repos].sort((a, b) => time(b) - time(a)).slice(0, count)
}
