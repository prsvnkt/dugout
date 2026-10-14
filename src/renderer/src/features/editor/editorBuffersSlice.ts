import type { ProjectId } from '@shared/project'
import type { FileStat } from '@shared/files'
import { dugout } from '@renderer/lib/dugout'
import { editorBridge } from './editorBridge'
import type { EditorOps } from './editorOps'
import type { EditorBufferActions, EditorGet, FileBuffer } from './editorState'
import { checkoutOf, fileKeyOf } from './fileKey'

/** A project's readable buffers, grouped by checkout so each group needs one stat call. */
function buffersByCheckout(
  buffers: Readonly<Record<string, FileBuffer>>,
  projectId: ProjectId,
): FileBuffer[][] {
  const byCheckout = new Map<string, FileBuffer[]>()
  for (const buffer of Object.values(buffers)) {
    if (buffer.checkout.projectId !== projectId || buffer.content.kind === 'error') continue
    const key = buffer.checkout.worktreePath ?? ''
    byCheckout.set(key, [...(byCheckout.get(key) ?? []), buffer])
  }
  return [...byCheckout.values()]
}

/** Marks or reloads one buffer whose file changed on disk; an unchanged one is left alone. */
async function applyDiskChange(ops: EditorOps, buffer: FileBuffer, stat: FileStat) {
  if (buffer.mtimeMs === null || stat.mtimeMs === buffer.mtimeMs) return
  if (stat.mtimeMs === null) ops.patchBuffer(buffer.fileKey, { diskState: 'deleted' })
  else if (buffer.isDirty) ops.patchBuffer(buffer.fileKey, { diskState: 'changed-on-disk' })
  else await ops.loadFile(buffer.checkout, buffer.path)
}

async function syncGroup(ops: EditorOps, group: readonly FileBuffer[]): Promise<void> {
  const first = group[0]
  if (!first) return
  const result = await dugout.files.stat(
    first.checkout,
    group.map((buffer) => buffer.path),
  )
  if (!result.ok) return
  for (const stat of result.data) {
    const buffer = group.find((candidate) => candidate.path === stat.path)
    if (buffer) await applyDiskChange(ops, buffer, stat)
  }
}

/** Editing pins the preview tabs showing the file, as in VS Code. */
function pinPreviewTabsOf(get: EditorGet, fileKey: string): void {
  for (const [projectId, tabs] of Object.entries(get().tabsByProject)) {
    for (const tab of tabs.tabs) {
      const tabKey = fileKeyOf(checkoutOf(projectId, tab.worktreePath), tab.path)
      if (tab.isPreview && tabKey === fileKey) get().pin(projectId, tab.id)
    }
  }
}

function createSave(get: EditorGet, ops: EditorOps): EditorBufferActions['save'] {
  return async (fileKey, options = {}) => {
    const buffer = get().buffers[fileKey]
    const content = editorBridge().getContent(fileKey)
    if (!buffer || content === undefined) return false
    const expectedMtimeMs = buffer.diskState === 'in-sync' ? buffer.mtimeMs : null
    const result = await dugout.files.write(buffer.checkout, buffer.path, content, {
      expectedMtimeMs,
      ...(options.force && { force: true }),
    })
    if (!result.ok) {
      const isConflict = /changed on disk/i.test(result.error)
      if (isConflict) ops.patchBuffer(fileKey, { diskState: 'changed-on-disk' })
      ops.setSaveError(fileKey, result.error)
      return false
    }
    editorBridge().markSaved(fileKey)
    const saved = { mtimeMs: result.data.mtimeMs, diskContent: content }
    ops.patchBuffer(fileKey, { ...saved, isDirty: false, diskState: 'in-sync' })
    ops.setSaveError(fileKey, null)
    return true
  }
}

/** Edits, saving, and keeping open files in step with changes made outside the editor. */
export function createBuffersSlice(get: EditorGet, ops: EditorOps): EditorBufferActions {
  return {
    setDirty(fileKey, isDirty) {
      if (get().buffers[fileKey]?.isDirty === isDirty) return
      ops.patchBuffer(fileKey, { isDirty })
      if (isDirty) pinPreviewTabsOf(get, fileKey)
    },
    save: createSave(get, ops),
    async saveAll(projectId) {
      const keys = Object.values(get().buffers)
        .filter((buffer) => buffer.isDirty && buffer.checkout.projectId === projectId)
        .map((buffer) => buffer.fileKey)
      for (const key of keys) await get().save(key)
    },
    async reload(fileKey) {
      const buffer = get().buffers[fileKey]
      if (!buffer) return
      await ops.loadFile(buffer.checkout, buffer.path)
      ops.setSaveError(fileKey, null)
    },
    keepMine: (fileKey) => ops.patchBuffer(fileKey, { diskState: 'in-sync', mtimeMs: null }),
    async syncWithDisk(projectId) {
      for (const group of buffersByCheckout(get().buffers, projectId)) await syncGroup(ops, group)
      // Diff originals change when files are staged or committed.
      const diffTabs = ops.tabsOf(projectId).tabs.filter((candidate) => candidate.kind === 'diff')
      for (const tab of diffTabs) {
        await ops.loadDiff(tab.id, checkoutOf(projectId, tab.worktreePath), tab.path, tab.staged)
      }
    },
  }
}
