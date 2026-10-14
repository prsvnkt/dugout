import type { StoreApi } from 'zustand'
import type { CompareTarget } from '@shared/compare'
import type { FileContent, RevisionContent } from '@shared/files'
import type { ProjectId } from '@shared/project'
import type { Task } from '@shared/tasks'
import type { GitCheckout } from '@shared/worktree'
import type { EditorTab, TabsState, TimelineTarget } from './tabs'

export type DiskState = 'in-sync' | 'changed-on-disk' | 'deleted'

/** What a buffer holds: editable text, or why there is none to edit. */
export type BufferContent =
  | { readonly kind: 'text' }
  | { readonly kind: 'binary' }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'error'; readonly message: string }

/** What we know about one file on disk; its text lives in a Monaco model. */
export interface FileBuffer {
  readonly fileKey: string
  readonly checkout: GitCheckout
  readonly path: string
  /** Text as last read from disk ('' unless `content` is text). Bumping `revision` reloads it. */
  readonly diskContent: string
  readonly revision: number
  readonly mtimeMs: number | null
  readonly isDirty: boolean
  readonly content: BufferContent
  readonly diskState: DiskState
}

/** The left side of a diff (HEAD or index), and the right side for staged diffs. */
export interface DiffSides {
  readonly original: RevisionContent
  /** Staged diffs show the index on the right; unstaged diffs use the working file's model. */
  readonly stagedModified: RevisionContent | null
}

/** Tab actions: opening, focusing and closing editor tabs. */
export interface EditorTabActions {
  openFile(
    projectId: ProjectId,
    worktreePath: string | null,
    path: string,
    isPreview: boolean,
  ): void
  openDiff(projectId: ProjectId, worktreePath: string | null, path: string, staged: boolean): void
  /** Opens (or focuses) a Compare tab for two worktrees, e.g. two agents on one task. */
  openCompare(projectId: ProjectId, key: string, target: CompareTarget): void
  /** Opens (or focuses) the project's Agent settings tab. */
  openAgentSettings(projectId: ProjectId): void
  /** The project's token usage (one tab per project). */
  openUsage(projectId: ProjectId): void
  /** Opens (or focuses) the project's Context tab. */
  openContext(projectId: ProjectId): void
  /** Opens (or focuses) an agent session's timeline; `title` names its tab. */
  openTimeline(projectId: ProjectId, target: TimelineTarget, title: string): void
  /** Opens (or focuses) a task's tab; as a preview, it replaces the previous preview tab. */
  openTask(
    projectId: ProjectId,
    task: Pick<Task, 'number' | 'key' | 'title'>,
    isPreview: boolean,
  ): void
  activate(projectId: ProjectId, tabId: string): void
  pin(projectId: ProjectId, tabId: string): void
  /** Closes a tab, or asks first when its file has unsaved changes. */
  requestClose(projectId: ProjectId, tabId: string): void
  resolveClose(projectId: ProjectId, choice: 'save' | 'discard' | 'cancel'): Promise<void>
  removeProject(projectId: ProjectId): void
}

/** Buffer actions: edits, saving, and keeping open files in step with the disk. */
export interface EditorBufferActions {
  setDirty(fileKey: string, isDirty: boolean): void
  save(fileKey: string, options?: { force?: boolean }): Promise<boolean>
  saveAll(projectId: ProjectId): Promise<void>
  /** Reloads from disk, discarding unsaved edits. */
  reload(fileKey: string): Promise<void>
  /** Keeps unsaved edits; the next save overwrites the file on disk. */
  keepMine(fileKey: string): void
  /** Picks up changes made outside the editor (e.g. by an agent) for a project's open files. */
  syncWithDisk(projectId: ProjectId): Promise<void>
}

export interface EditorData {
  readonly tabsByProject: Readonly<Record<ProjectId, TabsState>>
  readonly buffers: Readonly<Record<string, FileBuffer>>
  readonly diffs: Readonly<Record<string, DiffSides>>
  /** Tab waiting for a Save / Don't Save answer before it closes. */
  readonly pendingClose: Readonly<Record<ProjectId, string | null>>
  readonly saveErrors: Readonly<Record<string, string | null>>
}

export type EditorState = EditorData & EditorTabActions & EditorBufferActions

export type EditorSet = StoreApi<EditorState>['setState']
export type EditorGet = StoreApi<EditorState>['getState']

export const tabIdOf = (kind: EditorTab['kind'], fileKey: string, staged: boolean): string =>
  `${kind}:${staged ? 's' : 'u'}:${fileKey}`

/** What a successful read holds; a binary file wins over a too-large one. */
export function contentOf(file: FileContent): BufferContent {
  if (file.isBinary) return { kind: 'binary' }
  if (file.isTooLarge) return { kind: 'too-large' }
  return { kind: 'text' }
}
