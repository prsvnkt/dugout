/** A sensible folder name for a clone: the repository name from its URL. */
export function folderNameFromUrl(url: string): string {
  const lastSegment = url.trim().replace(/\/+$/, '').split(/[/:]/).pop() ?? ''
  return lastSegment
    .replace(/\.git$/, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+/, '')
}
