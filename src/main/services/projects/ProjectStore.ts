import { readFile, rename } from 'node:fs/promises'
import { projectsFileSchema, type ProjectAddRequest } from '@shared/ipc/contract'
import type { Project, ProjectColor, ProjectId } from '@shared/project'
import { writeFileAtomic } from './atomicWrite'

export interface ProjectStoreDeps {
  readonly filePath: string
  readonly createId: () => ProjectId
  readonly now: () => Date
  readonly resolveRepoRoot: (path: string) => Promise<string | null>
}

export interface ProjectPatch {
  readonly name?: string | undefined
  readonly color?: ProjectColor | undefined
}

const FILE_VERSION = 1

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/** Persists the user's projects to a JSON file. All state changes replace the array. */
export class ProjectStore {
  private projects: readonly Project[] = []

  constructor(private readonly deps: ProjectStoreDeps) {}

  list(): readonly Project[] {
    return this.projects
  }

  async load(): Promise<void> {
    const raw = await readFile(this.deps.filePath, 'utf8').catch((error: unknown) => {
      if (isMissingFile(error)) return null
      throw error
    })
    if (raw === null) return

    const parsed = projectsFileSchema.safeParse(safeJsonParse(raw))
    if (parsed.success) {
      this.projects = parsed.data.projects
      return
    }
    await this.quarantineCorruptFile()
  }

  async add(request: ProjectAddRequest): Promise<Project> {
    const rootPath = await this.deps.resolveRepoRoot(request.rootPath)
    if (!rootPath) throw new Error(`${request.rootPath} is not inside a git repository.`)

    const existing = this.projects.find((project) => project.rootPath === rootPath)
    if (existing) throw new Error(`This repository is already added as "${existing.name}".`)

    const project: Project = {
      id: this.deps.createId(),
      name: request.name,
      rootPath,
      color: request.color,
      createdAt: this.deps.now().toISOString(),
    }
    await this.commit([...this.projects, project])
    return project
  }

  async update(id: ProjectId, patch: ProjectPatch): Promise<Project> {
    const current = this.projects.find((project) => project.id === id)
    if (!current) throw new Error('Project not found.')

    const updated: Project = {
      ...current,
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.color !== undefined && { color: patch.color }),
    }
    await this.commit(this.projects.map((project) => (project.id === id ? updated : project)))
    return updated
  }

  async remove(id: ProjectId): Promise<void> {
    await this.commit(this.projects.filter((project) => project.id !== id))
  }

  private async commit(projects: readonly Project[]): Promise<void> {
    const file = { version: FILE_VERSION, projects }
    await writeFileAtomic(this.deps.filePath, `${JSON.stringify(file, null, 2)}\n`)
    this.projects = projects
  }

  private async quarantineCorruptFile(): Promise<void> {
    const backupPath = `${this.deps.filePath}.corrupt-${this.deps.now().getTime()}`
    await rename(this.deps.filePath, backupPath)
    console.warn(`[projects] ${this.deps.filePath} was invalid; moved to ${backupPath}`)
    this.projects = []
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
