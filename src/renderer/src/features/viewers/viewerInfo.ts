import { viewerKindOf, type ViewerKind } from '@shared/viewers'
import type { BufferContent } from '@renderer/features/editor/editorState'

/**
 * The viewer an open file shows in, or null for the code editor (or its notice). Media is
 * streamed from disk, so it shows whatever the text read said (binary, too large); Markdown
 * needs its text. A failed read shows its error instead.
 */
export function viewerFor(path: string, content: BufferContent): ViewerKind | null {
  const kind = viewerKindOf(path)
  if (!kind || content.kind === 'error') return null
  if (kind === 'markdown' && content.kind !== 'text') return null
  return kind
}

const KIND_NOUNS: Readonly<Record<ViewerKind, string>> = {
  markdown: 'Markdown',
  image: 'image',
  video: 'video',
  audio: 'audio',
  pdf: 'document',
}

const BYTES_PER_UNIT = 1024
const UNITS = ['KB', 'MB', 'GB'] as const

/** "PNG image", "MP4 video", "PDF document", "Markdown": the viewer toolbar's type label. */
export function fileTypeLabel(path: string, kind: ViewerKind): string {
  if (kind === 'markdown') return KIND_NOUNS.markdown
  const name = path.slice(path.lastIndexOf('/') + 1)
  const extension = name.slice(name.lastIndexOf('.') + 1).toUpperCase()
  return `${extension} ${KIND_NOUNS[kind]}`
}

/** "512 bytes", "1.5 KB", "12 MB": one decimal below 10, none above. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_UNIT) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`
  let value = bytes / BYTES_PER_UNIT
  let unit = 0
  while (value >= BYTES_PER_UNIT && unit < UNITS.length - 1) {
    value /= BYTES_PER_UNIT
    unit += 1
  }
  const digits = value < 10 ? 1 : 0
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

/** "1:05", "1:02:03": a media duration in seconds, as a player shows it. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const whole = Math.round(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = String(whole % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}
