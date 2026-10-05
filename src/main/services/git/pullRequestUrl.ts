const UNSUPPORTED = 'Creating pull requests is supported for GitHub and GitLab remotes.'

/** Accepts scp-style (`git@host:path`), ssh:// and https:// remote URLs. */
function parseRemote(remoteUrl: string): { host: string; path: string } {
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(remoteUrl)
  if (scp?.[1] && scp[2]) return { host: scp[1], path: scp[2] }
  try {
    const url = new URL(remoteUrl)
    if (!['https:', 'http:', 'ssh:'].includes(url.protocol)) throw new Error(UNSUPPORTED)
    return { host: url.hostname, path: url.pathname.replace(/^\//, '') }
  } catch {
    throw new Error(UNSUPPORTED)
  }
}

/** Encodes each segment but keeps `/`, which branch names commonly contain. */
function encodeBranch(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/')
}

/** The web page for opening a pull (or merge) request from `branch` into `base`. */
export function buildPullRequestUrl(remoteUrl: string, base: string, branch: string): string {
  const { host, path } = parseRemote(remoteUrl.trim())
  const repoPath = path.replace(/\.git$/, '').replace(/\/$/, '')
  if (!repoPath) throw new Error(UNSUPPORTED)

  if (host === 'github.com') {
    return `https://github.com/${repoPath}/compare/${encodeBranch(base)}...${encodeBranch(branch)}?expand=1`
  }
  if (host === 'gitlab.com') {
    const query = new URLSearchParams({
      'merge_request[source_branch]': branch,
      'merge_request[target_branch]': base,
    })
    return `https://gitlab.com/${repoPath}/-/merge_requests/new?${query.toString()}`
  }
  throw new Error(UNSUPPORTED)
}
