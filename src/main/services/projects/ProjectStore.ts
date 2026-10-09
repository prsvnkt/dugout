import { readFile, rename } from 'node:fs/promises'
import { projectsFileSchema, type ProjectAddRequest } from '@shared/ipc/contract'
import { pickProjectColor, suggestProjectName, type Project, type ProjectId } from '@shared/project'
import { applyQueueChange, type TaskQueueChange } from '@shared/taskQueue'
import type { TaskSource } from '@shared/tasks'
import { isEmptySetup, type WorktreeSetup } from '@shared/worktreeSetup'
import { writeFileAtomic } from './atomicWrite'

export interface ProjectStoreDeps {
  readonly filePath: string
  readonly createId: () => ProjectId
  readonly now: () => Date
  /** Picks new projects' colours; Math.random in the app. */
  readonly random: () => number
  readonly resolveRepoRoot: (path: string) => Promise<string | null>
}

const FILE_VERSION = 1

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/**
 * Persists the user's projects to a JSON file. All state changes replace the array, and run one
 * after another, each on the result of the last, so changes sent together (e.g. two queued tasks
 * starting at once) never undo each other.
 */
export class ProjectStore {
  private projects: readonly Project[] = []
  private pending: Promise<unknown> = Promise.resolve()

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
      // Names always follow the folder, including projects saved when names were editable.
      this.projects = parsed.data.projects.map(({ devCommand, checkCommand, ...project }) => ({
        ...project,
        name: suggestProjectName(project.rootPath),
        ...(devCommand && { devCommand }),
        ...(checkCommand && { checkCommand }),
      }))
      return
    }
    await this.quarantineCorruptFile()
  }

  add(request: ProjectAddRequest): Promise<Project> {
    return this.serially(async () => {
      const rootPath = await this.deps.resolveRepoRoot(request.rootPath)
      if (!rootPath) throw new Error(`${request.rootPath} is not inside a git repository.`)

      const existing = this.projects.find((project) => project.rootPath === rootPath)
      if (existing) throw new Error(`This repository is already added as "${existing.name}".`)

      const project: Project = {
        id: this.deps.createId(),
        name: suggestProjectName(rootPath),
        rootPath,
        color: pickProjectColor(this.projects, this.deps.random),
        createdAt: this.deps.now().toISOString(),
      }
      await this.commit([...this.projects, project])
      return project
    })
  }

  /** Sets the project's dev command; null or blank removes it. */
  setDevCommand(id: ProjectId, command: string | null): Promise<Project> {
    return this.setCommand(id, 'devCommand', command)
  }

  /** Sets the command Verify on Stop runs; null or blank turns it off. */
  setCheckCommand(id: ProjectId, command: string | null): Promise<Project> {
    return this.setCommand(id, 'checkCommand', command)
  }

  private setCommand(
    id: ProjectId,
    key: 'devCommand' | 'checkCommand',
    command: string | null,
  ): Promise<Project> {
    return this.update(id, (project) => {
      const { [key]: _previous, ...rest } = project
      const trimmed = command?.trim()
      return trimmed ? { ...rest, [key]: trimmed } : rest
    })
  }

  /** Sets what new worktrees copy and run; null, or a setup that does nothing, removes it. */
  setWorktreeSetup(id: ProjectId, setup: WorktreeSetup | null): Promise<Project> {
    return this.update(id, ({ worktreeSetup: _previous, ...rest }) =>
      setup && !isEmptySetup(setup) ? { ...rest, worktreeSetup: setup } : rest,
    )
  }

  async remove(id: ProjectId): Promise<void> {
    await this.serially(() => this.commit(this.projects.filter((project) => project.id !== id)))
  }

  /** Where the project's tasks live; GitHub is stored as the absence of a source. */
  setTaskSource(id: ProjectId, source: TaskSource): Promise<Project> {
    return this.update(id, ({ taskSource: _previous, ...rest }) =>
      source.kind === 'github' ? rest : { ...rest, taskSource: source },
    )
  }

  /** Adds, removes or moves a queued task (decision 047); an empty queue is stored as none. */
  changeTaskQueue(id: ProjectId, change: TaskQueueChange): Promise<Project> {
    return this.update(id, ({ taskQueue = [], ...rest }) => {
      const queue = applyQueueChange(taskQueue, change)
      return queue.length > 0 ? { ...rest, taskQueue: queue } : rest
    })
  }

  /** How many agents the queue lets run at once in the project. */
  setMaxAgents(id: ProjectId, maxAgents: number): Promise<Project> {
    return this.update(id, (project) => ({ ...project, maxAgents }))
  }

  /**
   * Records which `.mcp.json` servers the user approved for agents that do not ask themselves
   * (decision 057), as their hash; null forgets the approval.
   */
  setApprovedMcpServers(id: ProjectId, hash: string | null): Promise<Project> {
    return this.update(id, ({ approvedMcpServers: _previous, ...rest }) =>
      hash ? { ...rest, approvedMcpServers: hash } : rest,
    )
  }

  private update(id: ProjectId, change: (project: Project) => Project): Promise<Project> {
    return this.serially(async () => {
      const project = this.projects.find((candidate) => candidate.id === id)
      if (!project) throw new Error('Project not found.')
      const updated = change(project)
      await this.commit(
        this.projects.map((candidate) => (candidate.id === id ? updated : candidate)),
      )
      return updated
    })
  }

  /** Runs `task` after every change before it has finished, whether or not they failed. */
  private serially<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task)
    this.pending = result.catch(() => undefined)
    return result
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
