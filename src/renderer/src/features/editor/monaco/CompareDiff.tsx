import { useEffect, useRef } from 'react'
import { EDITOR_FONT, monaco, THEME } from './monacoSetup'
import { revisionModel } from './modelRegistry'
import styles from '../EditorArea.module.css'

interface CompareDiffProps {
  readonly tabId: string
  readonly path: string
  readonly left: string
  readonly right: string
}

/** Read-only side-by-side diff of one file as two agents left it. */
export default function CompareDiff({ tabId, path, left, right }: CompareDiffProps) {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    if (!host.current) return
    editor.current = monaco.editor.createDiffEditor(host.current, {
      ...EDITOR_FONT,
      theme: THEME,
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      minimap: { enabled: false },
    })
    return () => editor.current?.dispose()
  }, [])

  useEffect(() => {
    editor.current?.setModel({
      original: revisionModel(tabId, 'original', path, left),
      modified: revisionModel(tabId, 'modified', path, right),
    })
  }, [tabId, path, left, right])

  return (
    <div className={styles.surface}>
      <div ref={host} className={styles.host} />
    </div>
  )
}
