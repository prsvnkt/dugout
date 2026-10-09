import {
  isSameCheckout,
  useReviewCommentsStore,
  type CommentCheckout,
} from '@renderer/features/reviewComments/reviewCommentsStore'
import { selectedLines } from '@renderer/features/reviewComments/reviewPrompt'
import { monaco } from './monacoSetup'
import styles from './reviewComments.module.css'

/** The file one side of a diff shows, and the checkout it belongs to. */
export interface CommentSide extends CommentCheckout {
  readonly path: string
}

export interface ReviewCommentSupport {
  /** Re-reads the side (after the editor was pointed at another file). */
  refresh(): void
  dispose(): void
}

/** Starts a comment draft on the selected lines (or the cursor's line). */
function startDraft(editor: monaco.editor.IStandaloneCodeEditor, side: CommentSide): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return
  const { startLine, endLine } = selectedLines({
    startLine: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLine: selection.endLineNumber,
    endColumn: selection.endColumn,
  })
  const code = model.getValueInRange(
    new monaco.Range(startLine, 1, endLine, model.getLineMaxColumn(endLine)),
    monaco.editor.EndOfLinePreference.LF,
  )
  useReviewCommentsStore.getState().startDraft({ ...side, startLine, endLine, code })
}

/**
 * Lets the user comment on lines of a diff side for the agent (⌘⇧M or the context menu), and
 * marks lines that have pending comments. `sideOf` says what the editor shows right now.
 */
export function attachReviewComments(
  editor: monaco.editor.IStandaloneCodeEditor,
  sideOf: () => CommentSide | null,
): ReviewCommentSupport {
  const action = editor.addAction({
    id: 'dugout.addReviewComment',
    label: 'Add Review Comment',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 0,
    run: () => {
      const side = sideOf()
      if (side) startDraft(editor, side)
    },
  })
  const decorations = editor.createDecorationsCollection()
  const refresh = () => {
    const side = sideOf()
    const comments = side
      ? useReviewCommentsStore
          .getState()
          .comments.filter((comment) => comment.path === side.path && isSameCheckout(comment, side))
      : []
    decorations.set(
      comments.map((comment) => ({
        range: new monaco.Range(comment.startLine, 1, comment.endLine, 1),
        options: {
          isWholeLine: true,
          className: styles.commentedLine ?? null,
          linesDecorationsClassName: styles.commentMark ?? null,
          hoverMessage: { value: comment.text },
        },
      })),
    )
  }
  const unsubscribe = useReviewCommentsStore.subscribe((state, previous) => {
    if (state.comments !== previous.comments) refresh()
  })
  const modelChange = editor.onDidChangeModel(refresh)
  return {
    refresh,
    dispose: () => {
      unsubscribe()
      modelChange.dispose()
      decorations.clear()
      action.dispose()
    },
  }
}
