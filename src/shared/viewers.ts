import { z } from 'zod'
import { projectId, repoRelativePath } from './ipc/fields'
import type { GitCheckout } from './worktree'

/**
 * File viewers in the editor (decision 067): which files get one, and the `dugout-file:` URLs
 * that serve their bytes from main. Shared so main serves exactly the types the renderer shows.
 */

/** Files served over `dugout-file:` and shown by a media viewer. */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf'
/** Markdown is text: it keeps its Monaco buffer and adds a rendered preview. */
export type ViewerKind = MediaKind | 'markdown'

export interface MediaType {
  readonly kind: MediaKind
  readonly mime: string
}

const MEDIA_TYPES: Readonly<Record<string, MediaType>> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  avif: { kind: 'image', mime: 'image/avif' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  ico: { kind: 'image', mime: 'image/x-icon' },
  // Drawn through <img>, where SVG never runs scripts or loads other resources.
  svg: { kind: 'image', mime: 'image/svg+xml' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
}

const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown'])

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The media type main serves `path` as, or null when it is not a viewable media file. */
export function mediaTypeOf(path: string): MediaType | null {
  return MEDIA_TYPES[extensionOf(path)] ?? null
}

/** Which viewer a file opens in, or null for the plain code editor. */
export function viewerKindOf(path: string): ViewerKind | null {
  const extension = extensionOf(path)
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  return MEDIA_TYPES[extension]?.kind ?? null
}

/** Registered as a privileged scheme in main before the app is ready. */
export const FILE_SCHEME = 'dugout-file'
/** A standard scheme needs a host; it is always this one, the checkout is in the query. */
const FILE_HOST = 'checkout'

/**
 * The URL of a file in a checkout: the repo-relative path as the URL path, the project (and
 * worktree) in the query. Main resolves it through FileService; it never names a folder itself.
 * `version` (e.g. the file's mtime) changes the URL so a viewer reloads a changed file.
 */
export function fileUrl(checkout: GitCheckout, path: string, version?: number | null): string {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const query = new URLSearchParams({ project: checkout.projectId })
  if (checkout.worktreePath) query.set('worktree', checkout.worktreePath)
  if (version !== undefined && version !== null) query.set('v', String(version))
  return `${FILE_SCHEME}://${FILE_HOST}/${encodedPath}?${query.toString()}`
}

export interface FileUrlTarget {
  readonly checkout: GitCheckout
  readonly path: string
}

const targetSchema = z.object({
  projectId,
  worktreePath: z
    .string()
    .refine((path) => path.startsWith('/'))
    .optional(),
  path: repoRelativePath,
})

function decodedPath(pathname: string): string | null {
  try {
    return pathname.slice(1).split('/').map(decodeURIComponent).join('/')
  } catch {
    return null
  }
}

/** The checkout and path a `dugout-file:` URL names, or null when it is not a valid one. */
export function parseFileUrl(raw: string): FileUrlTarget | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${FILE_SCHEME}:` || url.host !== FILE_HOST) return null
  const parsed = targetSchema.safeParse({
    projectId: url.searchParams.get('project') ?? undefined,
    worktreePath: url.searchParams.get('worktree') ?? undefined,
    path: decodedPath(url.pathname),
  })
  if (!parsed.success) return null
  const { worktreePath, path } = parsed.data
  const checkout = worktreePath
    ? { projectId: parsed.data.projectId, worktreePath }
    : { projectId: parsed.data.projectId }
  return { checkout, path }
}
