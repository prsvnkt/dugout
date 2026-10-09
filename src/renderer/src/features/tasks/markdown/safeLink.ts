/**
 * The URL a markdown link may open, or null. Only https: links are opened, and only in the
 * browser (main's window-open handler); anything else (javascript:, file:, relative paths)
 * is shown as plain text.
 */
export function safeLinkUrl(href: string | null | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
