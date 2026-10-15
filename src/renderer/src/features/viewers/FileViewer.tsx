import { lazy, Suspense, useCallback, type ReactNode } from 'react'
import { fileUrl, type ViewerKind } from '@shared/viewers'
import type { GitCheckout } from '@shared/worktree'
import { editorBridge } from '@renderer/features/editor/editorBridge'
import type { FileBuffer } from '@renderer/features/editor/editorState'
import { checkoutOf } from '@renderer/features/editor/fileKey'
import { Markdown } from '@renderer/features/tasks/markdown/Markdown'
import { ImageViewer } from './ImageViewer'
import { markdownImagePath } from './markdownImages'
import { MediaPlayer } from './MediaPlayer'
import { useViewerMode } from './viewerModeStore'
import { ModeToggle, ViewerToolbar } from './ViewerToolbar'
import styles from './Viewers.module.css'

/** pdf.js is large; like Monaco, it loads the first time a PDF opens. */
const PdfViewer = lazy(() => import('./pdf/PdfViewer'))

interface FileViewerProps {
  readonly checkout: GitCheckout
  readonly path: string
  readonly kind: ViewerKind
  readonly buffer: FileBuffer
  /** The Monaco editor for the file, shown in Source mode. */
  readonly source: ReactNode
}

interface MarkdownPreviewProps {
  readonly checkout: GitCheckout
  readonly path: string
  readonly text: string
}

/** Markdown rendered safely (no raw HTML); local images come from the checkout. */
function MarkdownPreview({ checkout, path, text }: MarkdownPreviewProps) {
  const { projectId, worktreePath = null } = checkout
  // Keyed on the checkout's fields, not the object, so images do not reload on every render.
  const imageUrl = useCallback(
    (src: string) => {
      const imagePath = markdownImagePath(src, path)
      return imagePath ? fileUrl(checkoutOf(projectId, worktreePath), imagePath) : null
    },
    [projectId, worktreePath, path],
  )
  return (
    <div className={`${styles.stage} ${styles.paper}`} role="document" aria-label="Preview">
      <div className={styles.document}>
        <Markdown text={text} imageUrl={imageUrl} />
      </div>
    </div>
  )
}

/**
 * A file shown by its viewer: Markdown and SVG as a preview with a Source toggle (the Monaco
 * editor, so edits and saving work as before), images, video, audio and PDFs streamed from
 * main over `dugout-file:` (decision 067).
 */
export function FileViewer({ checkout, path, kind, buffer, source }: FileViewerProps) {
  const mode = useViewerMode(buffer.fileKey)
  const hasSource = buffer.content.kind === 'text'
  const toggle = hasSource ? <ModeToggle fileKey={buffer.fileKey} mode={mode} /> : null
  if (hasSource && mode === 'source') {
    return (
      <div className={styles.viewer}>
        <ViewerToolbar path={path} kind={kind}>
          {toggle}
        </ViewerToolbar>
        {source}
      </div>
    )
  }
  if (kind === 'markdown') {
    // Unsaved edits made in Source show in the preview too.
    const text = editorBridge().getContent(buffer.fileKey) ?? buffer.diskContent
    return (
      <div className={styles.viewer}>
        <ViewerToolbar path={path} kind={kind}>
          {toggle}
        </ViewerToolbar>
        <MarkdownPreview checkout={checkout} path={path} text={text} />
      </div>
    )
  }
  // The mtime in the URL reloads the viewer when the file changes on disk.
  const url = fileUrl(checkout, path, buffer.mtimeMs)
  if (kind === 'image') return <ImageViewer key={url} path={path} url={url} modeToggle={toggle} />
  if (kind === 'pdf') {
    return (
      <Suspense fallback={<p className={styles.message}>Loading viewer…</p>}>
        <PdfViewer key={url} path={path} url={url} />
      </Suspense>
    )
  }
  return <MediaPlayer key={url} path={path} url={url} kind={kind} />
}
