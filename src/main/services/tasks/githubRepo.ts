import { parseRemote } from '../git/pullRequestUrl'

export interface GitHubRepoRef {
  readonly owner: string
  readonly name: string
}

/** owner/name of a GitHub repository from its remote URL, or null for other hosts. */
export function githubRepoFromRemote(remoteUrl: string, webBaseUrl: string): GitHubRepoRef | null {
  let remote: { host: string; path: string }
  try {
    remote = parseRemote(remoteUrl.trim())
  } catch {
    return null
  }
  const base = new URL(webBaseUrl)
  const hostMatches = remote.host === base.hostname
  // A stub on 127.0.0.1:<port> is identified by host and port.
  const portMatches = !base.port || remoteUrl.includes(`${base.hostname}:${base.port}`)
  if (!hostMatches || !portMatches) return null
  const [owner, name] = remote.path
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .split('/')
  return owner && name ? { owner, name } : null
}
