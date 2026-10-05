import { useEditorStore, type FileBuffer } from '../editorStore'
import { registerEditorBridge } from '../editorBridge'
import { monaco } from './monacoSetup'

/**
 * One Monaco model per open file, shared by its file tab and the editable side of its diff tab,
 * so edits and undo history stay in sync. Unsaved state is tracked with Monaco's alternative
 * version id, which returns to the saved value when edits are undone.
 */
const models = new Map<string, monaco.editor.ITextModel>()
const savedVersions = new Map<string, number>()
const loadedRevisions = new Map<string, number>()
/** Read-only diff-side models, keyed by the diff tab that owns them. */
const revisionModels = new Map<string, monaco.editor.ITextModel[]>()

function uriFor(buffer: FileBuffer): monaco.Uri {
  return monaco.Uri.from({
    scheme: 'dugout',
    authority: encodeURIComponent(buffer.fileKey.split('::').slice(0, 2).join('~')),
    path: `/${buffer.path}`,
  })
}

function markSaved(fileKey: string): void {
  const model = models.get(fileKey)
  if (model) savedVersions.set(fileKey, model.getAlternativeVersionId())
}

/** Replaces a model's text with what is on disk, as one undoable edit. */
function applyDiskContent(model: monaco.editor.ITextModel, content: string): void {
  if (model.getValue() === content) return
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null)
}

export function modelFor(fileKey: string): monaco.editor.ITextModel | undefined {
  return models.get(fileKey)
}

function syncModel(buffer: FileBuffer): void {
  if (buffer.isBinary || buffer.isTooLarge || buffer.error) return
  const existing = models.get(buffer.fileKey)
  if (!existing) {
    const model = monaco.editor.createModel(buffer.diskContent, undefined, uriFor(buffer))
    models.set(buffer.fileKey, model)
    loadedRevisions.set(buffer.fileKey, buffer.revision)
    markSaved(buffer.fileKey)
    model.onDidChangeContent(() => {
      const isDirty = model.getAlternativeVersionId() !== savedVersions.get(buffer.fileKey)
      useEditorStore.getState().setDirty(buffer.fileKey, isDirty)
    })
    return
  }
  if (loadedRevisions.get(buffer.fileKey) === buffer.revision) return
  loadedRevisions.set(buffer.fileKey, buffer.revision)
  applyDiskContent(existing, buffer.diskContent)
  markSaved(buffer.fileKey)
  useEditorStore.getState().setDirty(buffer.fileKey, false)
}

function release(fileKeys: readonly string[]): void {
  for (const key of fileKeys) {
    models.get(key)?.dispose()
    models.delete(key)
    savedVersions.delete(key)
    loadedRevisions.delete(key)
  }
}

let isStarted = false

/** Keeps models in step with the store. Safe to call more than once. */
export function startModelRegistry(): void {
  if (isStarted) return
  isStarted = true
  registerEditorBridge({
    getContent: (fileKey) => models.get(fileKey)?.getValue(),
    markSaved,
    release,
  })
  const syncAll = () => Object.values(useEditorStore.getState().buffers).forEach(syncModel)
  syncAll()
  useEditorStore.subscribe((state, previous) => {
    if (state.buffers !== previous.buffers) syncAll()
    if (state.diffs !== previous.diffs) releaseClosedDiffs(Object.keys(state.diffs))
  })
}

function releaseClosedDiffs(openTabIds: readonly string[]): void {
  for (const [tabId, owned] of revisionModels) {
    if (openTabIds.includes(tabId)) continue
    owned.forEach((model) => model.dispose())
    revisionModels.delete(tabId)
  }
}

/** A read-only model for one side of a diff (HEAD or index content), owned by its tab. */
export function revisionModel(
  tabId: string,
  side: 'original' | 'modified',
  path: string,
  content: string,
): monaco.editor.ITextModel {
  const uri = monaco.Uri.from({
    scheme: 'dugout-git',
    authority: encodeURIComponent(`${tabId}~${side}`),
    path: `/${path}`,
  })
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    if (existing.getValue() !== content) existing.setValue(content)
    return existing
  }
  const model = monaco.editor.createModel(content, undefined, uri)
  revisionModels.set(tabId, [...(revisionModels.get(tabId) ?? []), model])
  return model
}
