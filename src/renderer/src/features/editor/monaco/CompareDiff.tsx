import { useEffect, useRef } from 'react'
import { EDITOR_FONT, monaco, THEME } from './monacoSetup'
import { revisionModel } from './modelRegistry'
import { attachReviewComments, type CommentSide, type ReviewCommentSupport } from './reviewComments'
import styles from '../EditorArea.module.css'

interface CompareDiffProps {
  readonly projectId: string
  readonly tabId: string
  /** The worktrees the two sides come from: comments on a side go to its agent. */
  readonly worktreePaths: readonly [string, string]
  readonly path: string
  readonly left: string
  readonly right: string
}

/** Read-only side-by-side diff of one file as two agents left it. */
export default function CompareDiff(props: CompareDiffProps) {
  const { projectId, tabId, worktreePaths, path, left, right } = props
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const sides = useRef<readonly [CommentSide | null, CommentSide | null]>([null, null])

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
    const comments: readonly ReviewCommentSupport[] = [
      attachReviewComments(editor.current.getOriginalEditor(), () => sides.current[0]),
      attachReviewComments(editor.current.getModifiedEditor(), () => sides.current[1]),
    ]
    return () => {
      comments.forEach((support) => support.dispose())
      editor.current?.dispose()
    }
  }, [])

  const [leftPath, rightPath] = worktreePaths
  useEffect(() => {
    sides.current = [
      { projectId, worktreePath: leftPath, path },
      { projectId, worktreePath: rightPath, path },
    ]
    editor.current?.setModel({
      original: revisionModel(tabId, 'original', path, left),
      modified: revisionModel(tabId, 'modified', path, right),
    })
  }, [projectId, leftPath, rightPath, tabId, path, left, right])

  return (
    <div className={styles.surface}>
      <div ref={host} className={styles.host} />
    </div>
  )
}
