import { mkdirSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import type { Project } from '@shared/project'
import { SESSION_BRANCH_PREFIX, type Worktree } from '@shared/worktree'
import type { GitService } from '../git/GitService'

export interface WorktreeManagerDeps {
  readonly git: GitService
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

  /** Creates a worktree; `name` (e.g. "42-fix-login") gets a suffix if already taken. */
  async create(project: Project, options: { name?: string } = {}): Promise<Worktree> {
    const status = await this.deps.git.status(project.rootPath)
    if (status.isUnborn) throw new Error('Make a first commit before starting a worktree session.')

    const name = await this.availableName(project, options.name)
    const path = join(this.projectDir(project), name)
    const branch = `${SESSION_BRANCH_PREFIX}${name}`
    mkdirSync(this.projectDir(project), { recursive: true })
    await this.deps.git.addWorktree(project.rootPath, path, branch)
    return { path, branch, name }
  }

  /**
   * Removes the worktree, then its session branch unless that has work the main checkout does
   * not (`git branch -d`, never -D), so finished sessions don't pile up as branches.
   */
  async remove(project: Project, path: string): Promise<void> {
    const worktree = await this.assertManaged(project, path)
    await this.deps.git.removeWorktree(project.rootPath, path)
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
