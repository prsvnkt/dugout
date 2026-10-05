/**
 * Connects the eagerly loaded editor store to the lazily loaded Monaco code. The Monaco chunk
 * registers these when it loads; until then there are no models, so nothing is unsaved.
 */
interface EditorBridge {
  /** Current text of a file's model (including unsaved edits), if it is open. */
  getContent(fileKey: string): string | undefined
  /** Marks the model's current text as saved. */
  markSaved(fileKey: string): void
  /** Disposes models no open tab uses any more. */
  release(fileKeys: readonly string[]): void
}

const noop: EditorBridge = {
  getContent: () => undefined,
  markSaved: () => {},
  release: () => {},
}

let bridge: EditorBridge = noop

export function registerEditorBridge(implementation: EditorBridge): void {
  bridge = implementation
}

export function editorBridge(): EditorBridge {
  return bridge
}
