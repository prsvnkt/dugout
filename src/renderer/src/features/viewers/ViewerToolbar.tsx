import type { ReactNode } from 'react'
import { Code, Eye, FileAudio, FileImage, FileText, FileVideo, type LucideIcon } from 'lucide-react'
import type { ViewerKind } from '@shared/viewers'
import { fail, ok, type Result } from '@shared/result'
import { Icon } from '@renderer/lib/Icon'
import { useRequest } from '@renderer/lib/useRequest'
import { useViewerModeStore, type ViewerMode } from './viewerModeStore'
import { fileTypeLabel, formatBytes } from './viewerInfo'
import styles from './Viewers.module.css'

const KIND_ICONS: Readonly<Record<ViewerKind, LucideIcon>> = {
  markdown: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileText,
}

interface ViewerToolbarProps {
  readonly path: string
  readonly kind: ViewerKind
  /** Size, dimensions, page count…; empty ones are skipped. */
  readonly details?: readonly (string | null | undefined)[]
  readonly children?: ReactNode
}

/** The bar above a viewer: the file's type and details, then the viewer's controls. */
export function ViewerToolbar({ path, kind, details = [], children }: ViewerToolbarProps) {
  const shown = details.filter((detail): detail is string => Boolean(detail))
  return (
    <div className={styles.toolbar}>
      <div className={styles.identity}>
        <Icon icon={KIND_ICONS[kind]} className={styles.kindIcon} />
        <span className={styles.label}>{fileTypeLabel(path, kind)}</span>
        {shown.length > 0 && (
          <span className={styles.details} data-testid="viewer-details">
            {shown.join('  ·  ')}
          </span>
        )}
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  )
}

const MODES: readonly { mode: ViewerMode; text: string; icon: LucideIcon }[] = [
  { mode: 'preview', text: 'Preview', icon: Eye },
  { mode: 'source', text: 'Source', icon: Code },
]

/** Preview / Source for a viewable text file; the choice is kept per file. */
export function ModeToggle({ fileKey, mode }: { fileKey: string; mode: ViewerMode }) {
  const setMode = useViewerModeStore((state) => state.setMode)
  return (
    <div className={styles.segmented} role="group" aria-label="Preview or source">
      {MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          className={styles.segment}
          aria-pressed={mode === option.mode}
          onClick={() => setMode(fileKey, option.mode)}
        >
          <Icon icon={option.icon} />
          {option.text}
        </button>
      ))}
    </div>
  )
}

async function sizeOf(url: string): Promise<Result<number>> {
  const response = await fetch(url, { method: 'HEAD' })
  const length = Number(response.headers.get('content-length'))
  return response.ok && Number.isFinite(length) ? ok(length) : fail('Size unknown.')
}

/** "1.5 MB" for a `dugout-file:` URL, from a HEAD request; null until known. */
export function useFileSizeText(url: string | null): string | null {
  const state = useRequest(
    () => (url ? sizeOf(url) : Promise.resolve(fail<number>('No file.'))),
    [url],
  )
  return state.kind === 'loaded' ? formatBytes(state.value) : null
}
