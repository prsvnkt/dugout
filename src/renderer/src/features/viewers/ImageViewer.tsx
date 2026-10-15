import { useState, type ReactNode } from 'react'
import { Scan, ZoomIn } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { useFileSizeText, ViewerToolbar } from './ViewerToolbar'
import styles from './Viewers.module.css'

interface ImageViewerProps {
  readonly path: string
  readonly url: string
  /** Preview / Source, for an SVG. */
  readonly modeToggle?: ReactNode
}

interface Size {
  readonly width: number
  readonly height: number
}

/**
 * An image fitted to the tab, or at actual size (click it, or the toolbar). Drawn with <img>,
 * so an SVG never runs script or loads anything else.
 */
export function ImageViewer({ path, url, modeToggle }: ImageViewerProps) {
  const [isActualSize, setActualSize] = useState(false)
  const [size, setSize] = useState<Size | null>(null)
  const [hasFailed, setFailed] = useState(false)
  const sizeText = useFileSizeText(url)
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dimensions = size ? `${size.width} × ${size.height} px` : null
  const zoomButton = (actual: boolean, text: string, icon: typeof Scan) => (
    <button
      type="button"
      className={styles.segment}
      aria-pressed={isActualSize === actual}
      onClick={() => setActualSize(actual)}
    >
      <Icon icon={icon} />
      {text}
    </button>
  )
  return (
    <div className={styles.viewer}>
      <ViewerToolbar path={path} kind="image" details={[dimensions, sizeText]}>
        <div className={styles.segmented} role="group" aria-label="Zoom">
          {zoomButton(false, 'Fit', Scan)}
          {zoomButton(true, 'Actual size', ZoomIn)}
        </div>
        {modeToggle}
      </ViewerToolbar>
      <div className={`${styles.stage} ${styles.checker}`}>
        {hasFailed ? (
          <p className={styles.message}>This image could not be shown.</p>
        ) : (
          <div className={isActualSize ? styles.actual : styles.fit}>
            <img
              className={styles.image}
              src={url}
              alt={name}
              draggable={false}
              onLoad={(event) =>
                setSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => setFailed(true)}
              onClick={() => setActualSize((actual) => !actual)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
