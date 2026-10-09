/** Where a branch's latest deployment stands, from its newest GitHub deployment status. */
export type DeploymentState = 'ready' | 'pending' | 'failed'

/**
 * A branch's preview deployment, from GitHub deployments and their statuses (which Vercel,
 * Netlify and others report). `url` is the newest ready deployment's address, or null.
 */
export interface PreviewDeployment {
  readonly environment: string
  readonly state: DeploymentState
  readonly url: string | null
}

/** A dev server started in a shell: the project's dev command and the `PORT` it was given. */
export interface DevServer {
  readonly command: string
  readonly port: number
}

/** Ports Dugout hands out to dev servers, away from common framework defaults. */
export const DEV_PORT_RANGE = { first: 4100, last: 4199 } as const

/** PORT values a terminal may be started with: never a privileged port. */
export const MIN_DEV_PORT = 1024
export const MAX_DEV_PORT = 65_535

export const MAX_DEV_COMMAND_LENGTH = 1000
/** A dev command is typed into a shell as one line, so it may hold no control characters. */
export function isOneLineCommand(command: string): boolean {
  return !/\p{Cc}/u.test(command)
}

/** The address a dev server on `port` answers on. */
export function devServerUrl(port: number): string {
  return `http://localhost:${port}`
}

/** `raw` as an absolute http(s) URL without credentials, or null for anything else. */
export function toWebUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const isWeb = url.protocol === 'http:' || url.protocol === 'https:'
  if (!isWeb || url.username || url.password || !url.hostname) return null
  return url.toString()
}
