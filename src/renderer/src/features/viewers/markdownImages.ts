import { isInGitDir } from '@shared/ipc/fields'
import { mediaTypeOf } from '@shared/viewers'

/** `https:`, `data:`, `file:`, `//host`…: anything that is not a path in the checkout. */
const HAS_SCHEME_OR_HOST = /^([a-z][a-z\d+.-]*:|\/\/)/i

function decoded(text: string): string | null {
  try {
    return decodeURI(text)
  } catch {
    return null
  }
}

/** Joins `segments` onto `base`, applying `.` and `..`; null when it climbs above the root. */
function joinInside(base: readonly string[], segments: readonly string[]): string[] | null {
  const parts = [...base]
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment !== '..') parts.push(segment)
    else if (parts.pop() === undefined) return null
  }
  return parts
}

/**
 * The repo-relative path of an image a Markdown file links to (`![](../img/a.png)`), or null
 * when it is not a local image in the checkout: remote URLs, other schemes, paths climbing
 * out of the checkout, `.git`, or files that are not images. Like GitHub, `/x.png` starts at
 * the repository root. Main checks the result again through FileService.
 */
export function markdownImagePath(src: string, markdownPath: string): string | null {
  const trimmed = src.trim()
  if (!trimmed || HAS_SCHEME_OR_HOST.test(trimmed)) return null
  const withoutSuffix = decoded(trimmed.replace(/[?#].*$/, ''))
  if (!withoutSuffix) return null

  const isFromRoot = withoutSuffix.startsWith('/')
  const folder = markdownPath.split('/').slice(0, -1)
  const parts = joinInside(isFromRoot ? [] : folder, withoutSuffix.split('/'))
  if (!parts || parts.length === 0) return null
  const path = parts.join('/')
  if (isInGitDir(path) || mediaTypeOf(path)?.kind !== 'image') return null
  return path
}
