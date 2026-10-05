import { existsSync } from 'node:fs'
import { readFile, rename } from 'node:fs/promises'
import {
  workspaceSnapshotSchema,
  type SavedPane,
  type WorkspaceSnapshot,
} from '@shared/ipc/contract'
import type { ProjectId } from '@shared/project'
import { writeFileAtomic } from '../projects/atomicWrite'

export interface LayoutStoreDeps {
  readonly filePath: string
}

const EMPTY: WorkspaceSnapshot = { version: 1, projects: {} }

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

function isRestorable(pane: SavedPane): boolean {
  return pane.worktree === undefined || existsSync(pane.worktree.path)
}

/** Saves each project's panes to workspace.json so they can be restored on launch. */
export class LayoutStore {
  constructor(private readonly deps: LayoutStoreDeps) {}

  /** Loads the snapshot, keeping only known projects and panes whose folders still exist. */
  async load(projectIds: readonly ProjectId[]): Promise<WorkspaceSnapshot> {
    const raw = await readFile(this.deps.filePath, 'utf8').catch((error: unknown) => {
      if (isMissingFile(error)) return null
      throw error
    })
    if (raw === null) return EMPTY

    const parsed = workspaceSnapshotSchema.safeParse(safeJsonParse(raw))
    if (!parsed.success) {
      await this.quarantine()
      return EMPTY
    }
    const known = new Set(projectIds)
    const projects = Object.fromEntries(
      Object.entries(parsed.data.projects)
        .filter(([id]) => known.has(id))
        .map(([id, layout]) => [id, { panes: layout.panes.filter(isRestorable) }]),
    )
    return { version: 1, projects }
  }

  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    await writeFileAtomic(this.deps.filePath, `${JSON.stringify(snapshot, null, 2)}\n`)
  }

  private async quarantine(): Promise<void> {
    const backupPath = `${this.deps.filePath}.corrupt-${Date.now()}`
    await rename(this.deps.filePath, backupPath)
    console.warn(`[workspace] ${this.deps.filePath} was invalid; moved to ${backupPath}`)
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
