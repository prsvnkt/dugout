import type { AgentStatus, SubagentUpdate } from './agentStatus'
import type { AgentConfig, McpServer } from './agentConfig'
import type { CloneDefaults, CloneProgress } from './clone'
import type { CheckStatus } from './checks'
import type { WorktreeChanges } from './compare'
import type { AppCommand } from './commands'
import type { DirEntry, FileContent, FileStat, GitRevision, RevisionContent } from './files'
import type { GitBranch, GitStatus } from './git'
import type { PreviewDeployment } from './preview'
import type { FailingCheck, PullRequestStatus, PullReviewThread } from './pullRequest'
import type { ToolCallPreview } from './toolCall'
import type { DeviceCodePrompt, GitHubAuthState, GitHubRepo } from './github'
import type {
  ProjectAddRequest,
  CloneRequest,
  SettingsUpdateRequest,
  TaskCreateRequest,
  TaskUpdateRequest,
  TerminalCreateRequest,
  WorkspaceSnapshot,
} from './ipc/contract'
import type { ExternalAppId, OpenInApps } from './openIn'
import type { Project, ProjectId } from './project'
import type { Result } from './result'
import type { AppSettings } from './settings'
import type { AgentKind, TerminalExit, TerminalId } from './terminal'
import type { LinearState, LinearTeam } from './linear'
import type { Task, TaskDetail, TaskSource } from './tasks'
import type { TaskSession } from './taskSession'
import type { AgentCliCheck, LocalRepo, RepoSearchScope } from './welcome'
import type { GitCheckout, Worktree } from './worktree'
import type { WorktreeSetup } from './worktreeSetup'

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
    /**
     * Status of agent terminals, reported by their hooks. `detail`: why the agent is waiting or
     * what it finished, when known. `approvals`: the tool calls waiting for the user's approval.
     */
    onAgentStatus(
      listener: (
        id: TerminalId,
        status: AgentStatus,
        detail: string | undefined,
        approvals: readonly ToolCallPreview[],
      ) => void,
    ): Unsubscribe
    /** Claude session ids, used to resume conversations after a restart. */
    onAgentSession(listener: (id: TerminalId, sessionId: string) => void): Unsubscribe
    /** Subagents an agent starts and finishes, from its hooks. */
    onAgentSubagent(listener: (id: TerminalId, update: SubagentUpdate) => void): Unsubscribe
    /** Verify on Stop: the project's check command running after the agent finished a turn. */
    onCheckStatus(listener: (id: TerminalId, status: CheckStatus) => void): Unsubscribe
  }
  readonly projects: {
    list(): Promise<Result<readonly Project[]>>
    add(request: ProjectAddRequest): Promise<Result<Project>>
    remove(id: ProjectId): Promise<Result<void>>
    /** Sets the command "Run" starts a dev server with; null or blank removes it. */
    setDevCommand(id: ProjectId, command: string | null): Promise<Result<Project>>
    /** Sets the command Verify on Stop runs; null or blank turns it off. */
    setCheckCommand(id: ProjectId, command: string | null): Promise<Result<Project>>
    /** Chooses where the project's tasks live (GitHub Issues or a Linear team). */
    setTaskSource(projectId: ProjectId, source: TaskSource): Promise<Result<Project>>
    /** Sets what new worktrees copy and run before their first agent; null turns it off. */
    setWorktreeSetup(id: ProjectId, setup: WorktreeSetup | null): Promise<Result<Project>>
  }
  /** Preview deployments and local dev servers, for checking what an agent changed. */
  readonly preview: {
    /** The branch's newest preview deployment on GitHub; null when there is none. */
    deployment(checkout: GitCheckout): Promise<Result<PreviewDeployment | null>>
    /** A free port for a new dev server, other than the ones already given out. */
    assignPort(reserved: readonly number[]): Promise<Result<number>>
    /** Opens a reported preview or a local dev server in the browser. */
    openUrl(url: string): Promise<Result<void>>
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
    /** `includeAll` stages every change first (smart commit). */
    commit(
      checkout: GitCheckout,
      message: string,
      options?: { includeAll?: boolean },
    ): Promise<Result<void>>
    /** Fetches every remote (with prune); never changes files. */
    fetch(checkout: GitCheckout): Promise<Result<void>>
    push(checkout: GitCheckout): Promise<Result<void>>
    /** Pushes if needed, then opens the new pull request page. Resolves to its URL. */
    openPullRequest(checkout: GitCheckout): Promise<Result<string>>
    /** The branch's pull request with review and CI checks; null when there is none. */
    pullRequestStatus(checkout: GitCheckout): Promise<Result<PullRequestStatus | null>>
    /** The pull request's unresolved review threads, oldest first. */
    pullRequestReviewThreads(
      checkout: GitCheckout,
      number: number,
    ): Promise<Result<readonly PullReviewThread[]>>
    /** The failing CI checks on the pull request's head, with their output and log tail. */
    pullRequestFailingChecks(
      checkout: GitCheckout,
      number: number,
    ): Promise<Result<readonly FailingCheck[]>>
    /** Opens a GitHub page (pull request or check) in the browser. */
    openUrl(url: string): Promise<Result<void>>
    /** Local branches, then remote-only ones, newest first. */
    branches(checkout: GitCheckout): Promise<Result<readonly GitBranch[]>>
    switchBranch(
      checkout: GitCheckout,
      branch: { kind: GitBranch['kind']; name: string },
    ): Promise<Result<void>>
    /** Creates a branch at HEAD (or at `startPoint`) and switches to it. */
    createBranch(checkout: GitCheckout, name: string, startPoint?: string): Promise<Result<void>>
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
  /** GitHub sign-in (device flow). The token never reaches the renderer. */
  readonly github: {
    getState(): Promise<Result<GitHubAuthState>>
    startSignIn(): Promise<Result<DeviceCodePrompt>>
    cancelSignIn(): Promise<Result<void>>
    signOut(): Promise<Result<void>>
    openVerificationPage(): Promise<Result<void>>
    /** Re-check the session now if GitHub was unreachable (e.g. back online). */
    retry(): Promise<Result<void>>
    listRepos(): Promise<Result<readonly GitHubRepo[]>>
    onStateChange(listener: (state: GitHubAuthState) => void): Unsubscribe
  }
  /** Linear, for projects whose tasks are Linear issues. The API key never reaches the renderer. */
  readonly linear: {
    getState(): Promise<Result<LinearState>>
    /** Checks the personal API key with Linear, then stores it encrypted in main. */
    connect(apiKey: string): Promise<Result<LinearState>>
    disconnect(): Promise<Result<LinearState>>
    listTeams(): Promise<Result<readonly LinearTeam[]>>
  }
  /** Clone a repository into a folder; the caller then adds it as a project. */
  readonly clone: {
    defaults(): Promise<Result<CloneDefaults>>
    /** Resolves to the cloned folder's path. */
    start(request: CloneRequest): Promise<Result<string>>
    cancel(): void
    onProgress(listener: (progress: CloneProgress) => void): Unsubscribe
  }
  /** App preferences, such as the default agent. */
  readonly settings: {
    get(): Promise<Result<AppSettings>>
    update(change: SettingsUpdateRequest): Promise<Result<AppSettings>>
  }
  /** Opens a project's main checkout or one of its worktrees in an editor or Finder. */
  readonly openIn: {
    apps(): Promise<Result<OpenInApps>>
    /** Remembers `app` as the last choice once it opened. */
    open(checkout: GitCheckout, app: ExternalAppId): Promise<Result<void>>
  }
  /** A project's tasks: the GitHub Issues of its origin repository, or a Linear team's issues. */
  readonly tasks: {
    list(projectId: ProjectId): Promise<Result<readonly Task[]>>
    get(projectId: ProjectId, number: number): Promise<Result<TaskDetail>>
    create(request: TaskCreateRequest): Promise<Result<Task>>
    update(request: TaskUpdateRequest): Promise<Result<Task>>
    comment(projectId: ProjectId, number: number, body: string): Promise<Result<void>>
    openInBrowser(projectId: ProjectId, number: number): Promise<Result<void>>
    /** Creates the task's worktree, marks it in progress and returns what the pane needs. */
    startSession(
      projectId: ProjectId,
      number: number,
      agents: readonly AgentKind[],
    ): Promise<Result<TaskSession>>
  }
  readonly compare: {
    /** What each worktree changed since its branch left the base branch. */
    changes(
      projectId: ProjectId,
      worktreePaths: readonly string[],
    ): Promise<Result<readonly WorktreeChanges[]>>
  }
  /** A project's MCP servers (`.mcp.json`) and agent instructions (AGENTS.md / CLAUDE.md). */
  readonly agentConfig: {
    read(projectId: ProjectId): Promise<Result<AgentConfig>>
    saveMcp(
      projectId: ProjectId,
      servers: readonly McpServer[],
      version: string,
    ): Promise<Result<void>>
    linkInstructions(projectId: ProjectId): Promise<Result<void>>
  }
  /** Saved panes per project, restored on launch. */
  readonly workspace: {
    load(): Promise<Result<WorkspaceSnapshot>>
    save(snapshot: WorkspaceSnapshot): Promise<Result<void>>
  }
  /** What the first-run screen offers: repos on this Mac and whether the agent CLIs exist. */
  readonly welcome: {
    findRepos(scope: RepoSearchScope): Promise<Result<readonly LocalRepo[]>>
    checkAgents(): Promise<Result<AgentCliCheck>>
  }
  readonly dialog: {
    /** Resolves to the chosen absolute folder path, or null if cancelled. */
    pickFolder(): Promise<string | null>
  }
  /** Commands from the native menu and its keyboard shortcuts. */
  onCommand(listener: (command: AppCommand) => void): Unsubscribe
}
