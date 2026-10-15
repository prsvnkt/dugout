import { useEffect, useRef, useState, type RefObject } from 'react'
import { RenderingCancelledException, type PDFDocumentProxy } from 'pdfjs-dist'
import styles from '../Viewers.module.css'

/** Pages this far outside the viewport start drawing, so scrolling rarely shows a blank page. */
const PRELOAD_MARGIN = '600px 0px'

interface PdfPageProps {
  readonly doc: PDFDocumentProxy
  readonly number: number
  readonly width: number
  /** Height / width of the first page, until this page's own is known. */
  readonly defaultAspect: number
}

/** Becomes true once `element` scrolls near the viewport, and stays true. */
function useNearViewport(element: RefObject<HTMLElement | null>): boolean {
  const [isNear, setNear] = useState(false)
  useEffect(() => {
    const target = element.current
    if (!target || isNear) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: PRELOAD_MARGIN },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [element, isNear])
  return isNear
}

/** One page, drawn to a canvas at the screen's pixel density once it nears the viewport. */
export function PdfPage({ doc, number, width, defaultAspect }: PdfPageProps) {
  const frame = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState(defaultAspect)
  const [isRendered, setRendered] = useState(false)
  const isNear = useNearViewport(frame)

  useEffect(() => {
    const target = canvas.current
    if (!isNear || !target || width <= 0) return
    let isCurrent = true
    let cancel = () => {}
    const draw = async () => {
      const page = await doc.getPage(number)
      if (!isCurrent) return
      const base = page.getViewport({ scale: 1 })
      setAspect(base.height / base.width)
      const viewport = page.getViewport({ scale: (width / base.width) * devicePixelRatio })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      const task = page.render({ canvas: target, viewport })
      cancel = () => task.cancel()
      await task.promise
      if (isCurrent) setRendered(true)
    }
    draw().catch((error: unknown) => {
      if (!(error instanceof RenderingCancelledException)) {
        console.warn(`[pdf] page ${number} failed to render`, error)
      }
    })
    return () => {
      isCurrent = false
      cancel()
    }
  }, [doc, number, width, isNear])

  return (
    <div className={styles.page} ref={frame} style={{ width, height: width * aspect }}>
      <canvas ref={canvas} role="img" aria-label={`Page ${number}`} data-rendered={isRendered} />
      <span className={styles.pageNumber} aria-hidden>
        {number}
      </span>
    </div>
  )
}
