import { useEffect, useRef } from 'react'
import type { DiffSides } from '../editorStore'
import type { EditorTab } from '../tabs'
import { EDITOR_FONT, monaco, THEME } from './monacoSetup'
import { modelFor, revisionModel, startModelRegistry } from './modelRegistry'
import { attachReviewComments, type CommentSide, type ReviewCommentSupport } from './reviewComments'
import styles from '../EditorArea.module.css'

startModelRegistry()

interface EditorSurfaceProps {
  readonly projectId: string
  readonly tab: EditorTab
  readonly fileKey: string
  /** Bumps when the file's model becomes available, so the editor attaches to it. */
  readonly modelRevision: number
  readonly diff: DiffSides | undefined
}

const SHARED_OPTIONS: monaco.editor.IEditorOptions = {
  ...EDITOR_FONT,
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  renderWhitespace: 'selection',
}

/** One code editor and one diff editor, re-pointed at models as tabs change. */
export default function EditorSurface(props: EditorSurfaceProps) {
  const { projectId, tab, fileKey, modelRevision, diff } = props
  const codeHost = useRef<HTMLDivElement>(null)
  const diffHost = useRef<HTMLDivElement>(null)
  const codeEditor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const diffEditor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  const shownKey = useRef<string | null>(null)
  /** The file the diff's right-hand side shows, for review comments. */
  const commentSide = useRef<CommentSide | null>(null)
  const comments = useRef<ReviewCommentSupport | null>(null)

  useEffect(() => {
    if (!codeHost.current || !diffHost.current) return
    codeEditor.current = monaco.editor.create(codeHost.current, { ...SHARED_OPTIONS, theme: THEME })
    diffEditor.current = monaco.editor.createDiffEditor(diffHost.current, {
      ...SHARED_OPTIONS,
      theme: THEME,
      renderSideBySide: true,
      originalEditable: false,
    })
    comments.current = attachReviewComments(
      diffEditor.current.getModifiedEditor(),
      () => commentSide.current,
    )
    return () => {
      comments.current?.dispose()
      codeEditor.current?.dispose()
      diffEditor.current?.dispose()
    }
  }, [])

  // File tabs: attach the shared model and restore the scroll/cursor position.
  useEffect(() => {
    const editor = codeEditor.current
    if (tab.kind !== 'file' || !editor) return
    if (shownKey.current) viewStates.current.set(shownKey.current, editor.saveViewState())
    const model = modelFor(fileKey) ?? null
    editor.setModel(model)
    shownKey.current = model ? fileKey : null
    const state = viewStates.current.get(fileKey)
    if (model && state) editor.restoreViewState(state)
    if (model) editor.focus()
  }, [tab.kind, fileKey, modelRevision])

  // Diff tabs: HEAD or index on the left; the editable working file (or index) on the right.
  useEffect(() => {
    const editor = diffEditor.current
    if (tab.kind !== 'diff' || !editor || !diff) return
    const original = revisionModel(tab.id, 'original', tab.path, diff.original.content)
    const modified = tab.staged
      ? revisionModel(tab.id, 'modified', tab.path, diff.stagedModified?.content ?? '')
      : modelFor(fileKey)
    if (!modified) return
    commentSide.current = { projectId, worktreePath: tab.worktreePath, path: tab.path }
    editor.setModel({ original, modified })
    editor.getModifiedEditor().updateOptions({ readOnly: tab.staged })
    comments.current?.refresh()
  }, [projectId, tab, fileKey, modelRevision, diff])

  return (
    <div className={styles.surface}>
      <div ref={codeHost} className={styles.host} hidden={tab.kind !== 'file'} />
      <div ref={diffHost} className={styles.host} hidden={tab.kind !== 'diff'} />
    </div>
  )
}
