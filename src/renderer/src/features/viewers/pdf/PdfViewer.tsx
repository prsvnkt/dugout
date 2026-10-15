import { useEffect, useRef, useState, type RefObject } from 'react'
import { Minus, Plus, Scan } from 'lucide-react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Icon } from '@renderer/lib/Icon'
import { useFileSizeText, ViewerToolbar } from '../ViewerToolbar'
import { PdfPage } from './PdfPage'
import styles from '../Viewers.module.css'

// A same-origin module worker: allowed by the CSP's `worker-src 'self'`.
GlobalWorkerOptions.workerSrc = workerUrl

/** Zoom relative to "fit to width". */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const
const FIT_INDEX = ZOOM_STEPS.indexOf(1)
/** Room around the pages (the .pages padding), and the narrowest a page gets. */
const STAGE_GUTTER_PX = 32
const MIN_PAGE_WIDTH_PX = 200
const DEFAULT_ASPECT = Math.SQRT2

type PdfState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly doc: PDFDocumentProxy; readonly aspect: number }
  | { readonly kind: 'failed' }

/**
 * Loads the document with pdf.js, which fetches byte ranges from `dugout-file:` as pages need
 * them. Not `useRequest`: the document holds a worker, so the effect must destroy it.
 */
function usePdfDocument(url: string): PdfState {
  const [state, setState] = useState<{ url: string; state: PdfState } | null>(null)
  useEffect(() => {
    const task = getDocument({ url, useWasm: false, disableAutoFetch: true })
    task.promise
      .then(async (doc) => {
        const first = (await doc.getPage(1)).getViewport({ scale: 1 })
        setState({ url, state: { kind: 'loaded', doc, aspect: first.height / first.width } })
      })
      .catch((error: unknown) => {
        console.warn('[pdf] could not open the document', error)
        setState({ url, state: { kind: 'failed' } })
      })
    return () => void task.destroy()
  }, [url])
  return state?.url === url ? state.state : { kind: 'loading' }
}

/** The width of `element`'s content box, kept current as the tab resizes. */
function useWidth(element: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const target = element.current
    if (!target) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(target)
    return () => observer.disconnect()
  }, [element])
  return width
}

interface ZoomControlsProps {
  readonly index: number
  onChange(index: number): void
}

function ZoomControls({ index, onChange }: ZoomControlsProps) {
  const percent = `${Math.round((ZOOM_STEPS[index] ?? 1) * 100)}%`
  return (
    <div className={styles.segmented} role="group" aria-label="Zoom">
      <button
        type="button"
        className={styles.segment}
        aria-label="Zoom out"
        disabled={index === 0}
        onClick={() => onChange(index - 1)}
      >
        <Icon icon={Minus} />
      </button>
      <span className={styles.zoomValue} aria-live="polite">
        {percent}
      </span>
      <button
        type="button"
        className={styles.segment}
        aria-label="Zoom in"
        disabled={index === ZOOM_STEPS.length - 1}
        onClick={() => onChange(index + 1)}
      >
        <Icon icon={Plus} />
      </button>
      <button
        type="button"
        className={styles.segment}
        aria-pressed={index === FIT_INDEX}
        onClick={() => onChange(FIT_INDEX)}
      >
        <Icon icon={Scan} />
        Fit width
      </button>
    </div>
  )
}

/** A PDF's pages, stacked and scrolled, fitted to the tab's width and zoomable. */
export default function PdfViewer({ path, url }: { path: string; url: string }) {
  const stage = useRef<HTMLDivElement>(null)
  const [zoomIndex, setZoomIndex] = useState(FIT_INDEX)
  const state = usePdfDocument(url)
  const sizeText = useFileSizeText(url)
  const stageWidth = useWidth(stage)
  const fitWidth = Math.max(MIN_PAGE_WIDTH_PX, stageWidth - STAGE_GUTTER_PX)
  const pageWidth = Math.round(fitWidth * (ZOOM_STEPS[zoomIndex] ?? 1))
  const pageCount = state.kind === 'loaded' ? state.doc.numPages : null
  const pagesText = pageCount === null ? null : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
  return (
    <div className={styles.viewer}>
      <ViewerToolbar path={path} kind="pdf" details={[pagesText, sizeText]}>
        <ZoomControls index={zoomIndex} onChange={setZoomIndex} />
      </ViewerToolbar>
      <div className={styles.stage} ref={stage}>
        {state.kind === 'loading' && <p className={styles.message}>Opening document…</p>}
        {state.kind === 'failed' && <p className={styles.message}>This PDF could not be opened.</p>}
        {state.kind === 'loaded' && stageWidth > 0 && (
          <div className={styles.pages}>
            {Array.from({ length: state.doc.numPages }, (_, index) => (
              <PdfPage
                key={index + 1}
                doc={state.doc}
                number={index + 1}
                width={pageWidth}
                defaultAspect={state.aspect || DEFAULT_ASPECT}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
