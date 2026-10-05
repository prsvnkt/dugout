import type { AgentStatus } from './agentStatus'
import type { AppCommand } from './commands'
import type { DirEntry, FileContent, FileStat, GitRevision, RevisionContent } from './files'
import type { GitStatus } from './git'
import type {
  ProjectAddRequest,
  ProjectUpdateRequest,
  TerminalCreateRequest,
  WorkspaceSnapshot,
} from './ipc/contract'
import type { Project, ProjectId } from './project'
import type { Result } from './result'
import type { TerminalExit, TerminalId } from './terminal'
import type { GitCheckout, Worktree } from './worktree'

export type Unsubscribe = () => void

/** The API the preload script exposes to the renderer as `window.dugout`. */
export interface DugoutApi {
  readonly terminal: {
    create(request: TerminalCreateRequest): Promise<Result<TerminalId>>
    write(id: TerminalId, data: string): void
    resize(id: TerminalId, cols: number, rows: number): void
    kill(id: TerminalId): void
    onData(listener: (id: TerminalId, data: string) => void): Unsubscribe
    onExit(listener: (id: TerminalId, exit: TerminalExit) => void): Unsubscribe
    /** Status of Claude terminals, reported by Claude Code hooks. */
    onAgentStatus(listener: (id: TerminalId, status: AgentStatus) => void): Unsubscribe
    /** Claude session ids, used to resume conversations after a restart. */
    onAgentSession(listener: (id: TerminalId, sessionId: string) => void): Unsubscribe
  }
  readonly projects: {
    list(): Promise<Result<readonly Project[]>>
    add(request: ProjectAddRequest): Promise<Result<Project>>
    update(request: ProjectUpdateRequest): Promise<Result<Project>>
    remove(id: ProjectId): Promise<Result<void>>
  }
  /** Git operations on a project's main checkout or one of its worktrees. */
  readonly git: {
    status(checkout: GitCheckout): Promise<Result<GitStatus>>
    /** A file at HEAD or in the index, for the original side of a diff. */
    show(
      checkout: GitCheckout,
      path: string,
      revision: GitRevision,
    ): Promise<Result<RevisionContent>>
    stage(checkout: GitCheckout, paths: readonly string[]): Promise<Result<void>>
    unstage(checkout: GitCheckout, paths: readonly string[]): Promise<Result<void>>
    discard(checkout: GitCheckout, paths: readonly string[]): Promise<Result<void>>
    commit(checkout: GitCheckout, message: string): Promise<Result<void>>
    push(checkout: GitCheckout): Promise<Result<void>>
    /** Pushes if needed, then opens the new pull request page. Resolves to its URL. */
    openPullRequest(checkout: GitCheckout): Promise<Result<string>>
  }
  /** Isolated checkouts for agent sessions, on their own dugout/* branches. */
  readonly worktrees: {
    list(projectId: ProjectId): Promise<Result<readonly Worktree[]>>
    create(projectId: ProjectId): Promise<Result<Worktree>>
    remove(projectId: ProjectId, path: string): Promise<Result<void>>
  }
  /** Files inside a project checkout, for the explorer and editor. */
  readonly files: {
    readDir(checkout: GitCheckout, path: string): Promise<Result<readonly DirEntry[]>>
    read(checkout: GitCheckout, path: string): Promise<Result<FileContent>>
    stat(checkout: GitCheckout, paths: readonly string[]): Promise<Result<readonly FileStat[]>>
    /** Fails if the file changed on disk since `expectedMtimeMs`, unless `force`. */
    write(
      checkout: GitCheckout,
      path: string,
      content: string,
      options: { expectedMtimeMs: number | null; force?: boolean },
    ): Promise<Result<{ mtimeMs: number }>>
  }
  readonly editor: {
    /** Lets main warn before closing the window with unsaved edits. */
    setHasUnsavedChanges(hasUnsavedChanges: boolean): void
  }
  /** Saved panes per project, restored on launch. */
  readonly workspace: {
    load(): Promise<Result<WorkspaceSnapshot>>
    save(snapshot: WorkspaceSnapshot): Promise<Result<void>>
  }
  readonly dialog: {
    /** Resolves to the chosen absolute folder path, or null if cancelled. */
    pickFolder(): Promise<string | null>
  }
  /** Commands from the native menu and its keyboard shortcuts. */
  onCommand(listener: (command: AppCommand) => void): Unsubscribe
}
