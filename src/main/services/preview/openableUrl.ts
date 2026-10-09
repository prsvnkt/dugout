import { MAX_DEV_PORT, MIN_DEV_PORT, toWebUrl } from '@shared/preview'

/** How many preview URLs main remembers having shown, so it can open them later. */
const MAX_KNOWN_URLS = 50

/** The preview URLs main has handed to the renderer: the only remote ones it will open. */
export class KnownPreviewUrls {
  private urls: readonly string[] = []

  remember(url: string): void {
    this.urls = [url, ...this.urls.filter((known) => known !== url)].slice(0, MAX_KNOWN_URLS)
  }

  has(url: string): boolean {
    return this.urls.includes(url)
  }
}

/** A local dev server's root, `http://localhost:<port>/`, on a port Dugout may assign. */
function isDevServerUrl(url: URL): boolean {
  const port = Number(url.port)
  return (
    url.protocol === 'http:' &&
    url.hostname === 'localhost' &&
    port >= MIN_DEV_PORT &&
    port <= MAX_DEV_PORT &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash
  )
}

/**
 * The normalised URL to open in the browser, or null to refuse it: only http(s), and only a
 * preview main itself reported or a dev server on localhost. Never an arbitrary renderer URL.
 */
export function openablePreviewUrl(raw: string, known: KnownPreviewUrls): string | null {
  const web = toWebUrl(raw)
  if (!web) return null
  return known.has(web) || isDevServerUrl(new URL(web)) ? web : null
}
