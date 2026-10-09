import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { Project } from '@shared/project'
import { SESSION_BRANCH_PREFIX, type Worktree } from '@shared/worktree'
import type { FileService } from '../files/FileService'
import type { GitService } from '../git/GitService'

/** A new worktree's setup command, handed to the first agent started in it. */
export interface ClaimedSetup {
  readonly command: string
  /** Reports how the run ended; a failed or interrupted run is offered to the next agent. */
  finish(isSuccess: boolean): void
}

export interface WorktreeManagerDeps {
  readonly git: GitService
  /** Copies the project's local files (worktree setup) into new worktrees. */
  readonly files: Pick<FileService, 'findCopyable' | 'copyFiles'>
  /** Folder that holds every Dugout-managed worktree, one subfolder per project. */
  readonly baseDir: string
  readonly createId: () => string
}

/**
 * Creates and removes the git worktrees that isolate agent sessions. It only ever touches
 * worktrees under its own base folder, so user-made worktrees are never listed or removed.
 */
export class WorktreeManager {
  private readonly baseDir: string
  /** Setup commands of new worktrees whose first agent has not run them yet, by path. */
  private readonly pendingSetups = new Map<string, string>()

  constructor(private readonly deps: WorktreeManagerDeps) {
    mkdirSync(deps.baseDir, { recursive: true })
    // git reports canonical paths (e.g. /private/var, not /var), so compare against those.
    this.baseDir = realpathSync(deps.baseDir)
  }

  async list(project: Project): Promise<Worktree[]> {
    const prefix = this.projectDir(project) + sep
    const worktrees = await this.deps.git.listWorktrees(project.rootPath)
    return worktrees
      .filter((worktree) => worktree.path.startsWith(prefix))
      .map(({ path, branch }) => ({ path, branch, name: path.slice(prefix.length) }))
  }

  /**
   * Creates a worktree; `name` (e.g. "42-fix-login") gets a suffix if already taken. With the
   * project's worktree setup, copies its local files in and keeps its command for the first agent.
   */
  async create(project: Project, options: { name?: string } = {}): Promise<Worktree> {
    const status = await this.deps.git.status(project.rootPath)
    if (status.isUnborn) throw new Error('Make a first commit before starting a worktree session.')

    const setup = project.worktreeSetup
    // Found before the worktree exists, so a bad pattern leaves nothing behind.
    const toCopy = setup?.copy.length
      ? await this.deps.files.findCopyable(project.rootPath, setup.copy)
      : []
    const name = await this.availableName(project, options.name)
    const path = join(this.projectDir(project), name)
    const branch = `${SESSION_BRANCH_PREFIX}${name}`
    mkdirSync(this.projectDir(project), { recursive: true })
    await this.deps.git.addWorktree(project.rootPath, path, branch)
    if (toCopy.length > 0) {
      await this.deps.files.copyFiles(project.rootPath, path, toCopy).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Created worktree ${name}, but copying its local files failed: ${reason}`)
      })
    }
    if (setup?.command) this.pendingSetups.set(path, setup.command)
    return { path, branch, name }
  }

  /**
   * The setup command the worktree at `path` still needs, taken by the agent that will run it
   * (null when there is none, or another agent is running it).
   */
  claimSetup(path: string): ClaimedSetup | null {
    const command = this.pendingSetups.get(path)
    if (command === undefined) return null
    this.pendingSetups.delete(path)
    return {
      command,
      finish: (isSuccess) => {
        if (!isSuccess && existsSync(path)) this.pendingSetups.set(path, command)
      },
    }
  }

  /**
   * Removes the worktree, then its session branch unless that has work the main checkout does
   * not (`git branch -d`, never -D), so finished sessions don't pile up as branches.
   */
  async remove(project: Project, path: string): Promise<void> {
    const worktree = await this.assertManaged(project, path)
    await this.deps.git.removeWorktree(project.rootPath, path)
    this.pendingSetups.delete(path)
    if (worktree.branch?.startsWith(SESSION_BRANCH_PREFIX)) {
      await this.deps.git.deleteBranchIfMerged(project.rootPath, worktree.branch)
    }
  }

  /** The folder git should run in: the main checkout, or a validated managed worktree. */
  async resolveCheckout(project: Project, worktreePath: string | undefined): Promise<string> {
    if (worktreePath === undefined) return project.rootPath
    await this.assertManaged(project, worktreePath)
    return worktreePath
  }

  private async availableName(project: Project, wanted: string | undefined): Promise<string> {
    if (!wanted) return this.deps.createId()
    const taken = new Set((await this.list(project)).map((worktree) => worktree.name))
    // A removed worktree leaves its branch behind; that name is taken too.
    const isFree =
      !taken.has(wanted) &&
      !(await this.deps.git.branchExists(project.rootPath, `${SESSION_BRANCH_PREFIX}${wanted}`))
    return isFree ? wanted : `${wanted}-${this.deps.createId()}`
  }

  private async assertManaged(project: Project, path: string): Promise<Worktree> {
    const worktree = (await this.list(project)).find((candidate) => candidate.path === path)
    if (!worktree) throw new Error('That folder is not a worktree of this project.')
    return worktree
  }

  private projectDir(project: Project): string {
    return join(this.baseDir, project.id)
  }
}
