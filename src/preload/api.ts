import type { IpcRenderer, IpcRendererEvent } from 'electron'
import type { DugoutApi, Unsubscribe } from '@shared/api'
import { IpcChannel } from '@shared/ipc/channels'

/** The part of Electron's `ipcRenderer` the API uses; unit tests pass a fake. */
export type IpcRendererLike = Pick<IpcRenderer, 'invoke' | 'send' | 'on' | 'removeListener'>

/**
 * Maps every `DugoutApi` method to its IPC channel. Kept free of runtime imports other than the
 * channel names, because the sandboxed preload cannot `require` npm packages.
 */
export function createDugoutApi(ipc: IpcRendererLike): DugoutApi {
  function subscribe<Args extends unknown[]>(
    channel: string,
    listener: (...args: Args) => void,
  ): Unsubscribe {
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as Args))
    ipc.on(channel, handler)
    return () => ipc.removeListener(channel, handler)
  }

  return {
    terminal: {
      create: (request) => ipc.invoke(IpcChannel.terminalCreate, request),
      write: (id, data) => ipc.send(IpcChannel.terminalWrite, { id, data }),
      resize: (id, cols, rows) => ipc.send(IpcChannel.terminalResize, { id, cols, rows }),
      kill: (id) => ipc.send(IpcChannel.terminalKill, { id }),
      onData: (listener) => subscribe(IpcChannel.terminalData, listener),
      onExit: (listener) => subscribe(IpcChannel.terminalExit, listener),
      onAgentStatus: (listener) => subscribe(IpcChannel.terminalAgentStatus, listener),
      onAgentSession: (listener) => subscribe(IpcChannel.terminalAgentSession, listener),
      onAgentSubagent: (listener) => subscribe(IpcChannel.terminalAgentSubagent, listener),
      onCheckStatus: (listener) => subscribe(IpcChannel.terminalCheckStatus, listener),
      onAgentUsage: (listener) => subscribe(IpcChannel.terminalAgentUsage, listener),
    },
    projects: {
      list: () => ipc.invoke(IpcChannel.projectList),
      add: (request) => ipc.invoke(IpcChannel.projectAdd, request),
      remove: (id) => ipc.invoke(IpcChannel.projectRemove, { id }),
      setDevCommand: (id, command) => ipc.invoke(IpcChannel.projectSetDevCommand, { id, command }),
      setCheckCommand: (id, command) =>
        ipc.invoke(IpcChannel.projectSetCheckCommand, { id, command }),
      setTaskSource: (projectId, source) =>
        ipc.invoke(IpcChannel.projectSetTaskSource, { projectId, source }),
      setWorktreeSetup: (id, setup) =>
        ipc.invoke(IpcChannel.projectSetWorktreeSetup, { id, setup }),
      changeTaskQueue: (id, change) =>
        ipc.invoke(IpcChannel.projectChangeTaskQueue, { id, change }),
      setMaxAgents: (id, maxAgents) =>
        ipc.invoke(IpcChannel.projectSetMaxAgents, { id, maxAgents }),
    },
    preview: {
      deployment: (checkout) => ipc.invoke(IpcChannel.previewDeployment, checkout),
      assignPort: (reserved) => ipc.invoke(IpcChannel.previewAssignPort, { reserved }),
      openUrl: (url) => ipc.invoke(IpcChannel.previewOpenUrl, { url }),
    },
    git: {
      status: (checkout) => ipc.invoke(IpcChannel.gitStatus, checkout),
      show: (checkout, path, revision) =>
        ipc.invoke(IpcChannel.gitShow, { ...checkout, path, revision }),
      stage: (checkout, paths) => ipc.invoke(IpcChannel.gitStage, { ...checkout, paths }),
      unstage: (checkout, paths) => ipc.invoke(IpcChannel.gitUnstage, { ...checkout, paths }),
      discard: (checkout, paths) => ipc.invoke(IpcChannel.gitDiscard, { ...checkout, paths }),
      commit: (checkout, message, options) =>
        ipc.invoke(IpcChannel.gitCommit, { ...checkout, message, ...options }),
      fetch: (checkout) => ipc.invoke(IpcChannel.gitFetch, checkout),
      push: (checkout) => ipc.invoke(IpcChannel.gitPush, checkout),
      openPullRequest: (checkout) => ipc.invoke(IpcChannel.gitOpenPullRequest, checkout),
      pullRequestStatus: (checkout) => ipc.invoke(IpcChannel.gitPullRequestStatus, checkout),
      pullRequestReviewThreads: (checkout, number) =>
        ipc.invoke(IpcChannel.gitPullRequestReviewThreads, { ...checkout, number }),
      pullRequestFailingChecks: (checkout, number) =>
        ipc.invoke(IpcChannel.gitPullRequestFailingChecks, { ...checkout, number }),
      openUrl: (url) => ipc.invoke(IpcChannel.gitOpenUrl, { url }),
      branches: (checkout) => ipc.invoke(IpcChannel.gitBranches, checkout),
      switchBranch: (checkout, branch) =>
        ipc.invoke(IpcChannel.gitSwitchBranch, { ...checkout, ...branch }),
      createBranch: (checkout, name, startPoint) =>
        ipc.invoke(IpcChannel.gitCreateBranch, { ...checkout, name, startPoint }),
    },
    worktrees: {
      list: (projectId) => ipc.invoke(IpcChannel.worktreeList, { projectId }),
      create: (projectId) => ipc.invoke(IpcChannel.worktreeCreate, { projectId }),
      remove: (projectId, path) => ipc.invoke(IpcChannel.worktreeRemove, { projectId, path }),
    },
    files: {
      readDir: (checkout, path) => ipc.invoke(IpcChannel.filesReadDir, { ...checkout, path }),
      read: (checkout, path) => ipc.invoke(IpcChannel.filesRead, { ...checkout, path }),
      stat: (checkout, paths) => ipc.invoke(IpcChannel.filesStat, { ...checkout, paths }),
      write: (checkout, path, content, options) =>
        ipc.invoke(IpcChannel.filesWrite, { ...checkout, path, content, ...options }),
    },
    editor: {
      setHasUnsavedChanges: (hasUnsavedChanges) =>
        ipc.send(IpcChannel.editorUnsavedChanges, hasUnsavedChanges === true),
    },
    github: {
      getState: () => ipc.invoke(IpcChannel.authGetState),
      startSignIn: () => ipc.invoke(IpcChannel.authStart),
      cancelSignIn: () => ipc.invoke(IpcChannel.authCancel),
      signOut: () => ipc.invoke(IpcChannel.authSignOut),
      openVerificationPage: () => ipc.invoke(IpcChannel.authOpenVerification),
      retry: () => ipc.invoke(IpcChannel.authRetry),
      listRepos: () => ipc.invoke(IpcChannel.githubListRepos),
      onStateChange: (listener) => subscribe(IpcChannel.authState, listener),
    },
    linear: {
      getState: () => ipc.invoke(IpcChannel.linearGetState),
      connect: (apiKey) => ipc.invoke(IpcChannel.linearConnect, { apiKey }),
      disconnect: () => ipc.invoke(IpcChannel.linearDisconnect),
      listTeams: () => ipc.invoke(IpcChannel.linearListTeams),
    },
    clone: {
      defaults: () => ipc.invoke(IpcChannel.cloneDefaults),
      start: (request) => ipc.invoke(IpcChannel.cloneStart, request),
      cancel: () => ipc.send(IpcChannel.cloneCancel),
      onProgress: (listener) => subscribe(IpcChannel.cloneProgress, listener),
    },
    settings: {
      get: () => ipc.invoke(IpcChannel.settingsGet),
      update: (change) => ipc.invoke(IpcChannel.settingsUpdate, change),
    },
    openIn: {
      apps: () => ipc.invoke(IpcChannel.openInApps),
      open: (checkout, app) => ipc.invoke(IpcChannel.openInOpen, { ...checkout, app }),
    },
    tasks: {
      list: (projectId) => ipc.invoke(IpcChannel.tasksList, { projectId }),
      get: (projectId, number) => ipc.invoke(IpcChannel.tasksGet, { projectId, number }),
      create: (request) => ipc.invoke(IpcChannel.tasksCreate, request),
      update: (request) => ipc.invoke(IpcChannel.tasksUpdate, request),
      comment: (projectId, number, body) =>
        ipc.invoke(IpcChannel.tasksComment, { projectId, number, body }),
      openInBrowser: (projectId, number) => ipc.invoke(IpcChannel.tasksOpen, { projectId, number }),
      startSession: (projectId, number, agents) =>
        ipc.invoke(IpcChannel.tasksStartSession, { projectId, number, agents }),
    },
    agentConfig: {
      read: (projectId) => ipc.invoke(IpcChannel.agentConfigRead, { projectId }),
      saveMcp: (projectId, servers, version) =>
        ipc.invoke(IpcChannel.agentConfigSaveMcp, { projectId, servers, version }),
      linkInstructions: (projectId) =>
        ipc.invoke(IpcChannel.agentConfigLinkInstructions, { projectId }),
    },
    context: {
      read: (projectId) => ipc.invoke(IpcChannel.contextRead, { projectId }),
      add: (projectId, entry) => ipc.invoke(IpcChannel.contextAdd, { projectId, entry }),
      edit: (projectId, edit) => ipc.invoke(IpcChannel.contextEdit, { projectId, ...edit }),
      remove: (projectId, id) => ipc.invoke(IpcChannel.contextRemove, { projectId, id }),
      repin: (projectId, id) => ipc.invoke(IpcChannel.contextRepin, { projectId, id }),
      approve: (projectId, id) => ipc.invoke(IpcChannel.contextApprove, { projectId, id }),
      discard: (projectId, id) => ipc.invoke(IpcChannel.contextDiscard, { projectId, id }),
      importDoc: (projectId, scope) =>
        ipc.invoke(IpcChannel.contextImportDoc, { projectId, scope }),
      buildCodemap: (projectId, agent) =>
        ipc.invoke(IpcChannel.contextBuildCodemap, { projectId, agent }),
      onChange: (listener) => subscribe(IpcChannel.contextChanged, listener),
    },
    compare: {
      changes: (projectId, worktreePaths) =>
        ipc.invoke(IpcChannel.compareChanges, { projectId, worktreePaths }),
    },
    usage: {
      project: (projectId) => ipc.invoke(IpcChannel.usageProject, { projectId }),
      onChange: (listener) => subscribe(IpcChannel.usageChanged, listener),
    },
    timeline: {
      session: (agent, sessionId) => ipc.invoke(IpcChannel.timelineSession, { agent, sessionId }),
    },
    workspace: {
      load: () => ipc.invoke(IpcChannel.workspaceLoad),
      save: (snapshot) => ipc.invoke(IpcChannel.workspaceSave, snapshot),
    },
    welcome: {
      findRepos: (scope) => ipc.invoke(IpcChannel.welcomeFindRepos, scope),
      checkAgents: () => ipc.invoke(IpcChannel.welcomeCheckAgents),
    },
    dialog: {
      pickFolder: () => ipc.invoke(IpcChannel.dialogPickFolder),
    },
    onCommand: (listener) => subscribe(IpcChannel.appCommand, listener),
  }
}
