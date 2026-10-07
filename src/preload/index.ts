import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DugoutApi, Unsubscribe } from '@shared/api'
import { IpcChannel } from '@shared/ipc/channels'

function subscribe<Args extends unknown[]>(
  channel: string,
  listener: (...args: Args) => void,
): Unsubscribe {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as Args))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DugoutApi = {
  terminal: {
    create: (request) => ipcRenderer.invoke(IpcChannel.terminalCreate, request),
    write: (id, data) => ipcRenderer.send(IpcChannel.terminalWrite, { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send(IpcChannel.terminalResize, { id, cols, rows }),
    kill: (id) => ipcRenderer.send(IpcChannel.terminalKill, { id }),
    onData: (listener) => subscribe(IpcChannel.terminalData, listener),
    onExit: (listener) => subscribe(IpcChannel.terminalExit, listener),
    onAgentStatus: (listener) => subscribe(IpcChannel.terminalAgentStatus, listener),
    onAgentSession: (listener) => subscribe(IpcChannel.terminalAgentSession, listener),
  },
  projects: {
    list: () => ipcRenderer.invoke(IpcChannel.projectList),
    add: (request) => ipcRenderer.invoke(IpcChannel.projectAdd, request),
    remove: (id) => ipcRenderer.invoke(IpcChannel.projectRemove, { id }),
  },
  git: {
    status: (checkout) => ipcRenderer.invoke(IpcChannel.gitStatus, checkout),
    show: (checkout, path, revision) =>
      ipcRenderer.invoke(IpcChannel.gitShow, { ...checkout, path, revision }),
    stage: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitStage, { ...checkout, paths }),
    unstage: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitUnstage, { ...checkout, paths }),
    discard: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitDiscard, { ...checkout, paths }),
    commit: (checkout, message, options) =>
      ipcRenderer.invoke(IpcChannel.gitCommit, { ...checkout, message, ...options }),
    push: (checkout) => ipcRenderer.invoke(IpcChannel.gitPush, checkout),
    openPullRequest: (checkout) => ipcRenderer.invoke(IpcChannel.gitOpenPullRequest, checkout),
    pullRequestStatus: (checkout) => ipcRenderer.invoke(IpcChannel.gitPullRequestStatus, checkout),
    openUrl: (url) => ipcRenderer.invoke(IpcChannel.gitOpenUrl, { url }),
    branches: (checkout) => ipcRenderer.invoke(IpcChannel.gitBranches, checkout),
    switchBranch: (checkout, branch) =>
      ipcRenderer.invoke(IpcChannel.gitSwitchBranch, { ...checkout, ...branch }),
    createBranch: (checkout, name, startPoint) =>
      ipcRenderer.invoke(IpcChannel.gitCreateBranch, { ...checkout, name, startPoint }),
  },
  worktrees: {
    list: (projectId) => ipcRenderer.invoke(IpcChannel.worktreeList, { projectId }),
    create: (projectId) => ipcRenderer.invoke(IpcChannel.worktreeCreate, { projectId }),
    remove: (projectId, path) => ipcRenderer.invoke(IpcChannel.worktreeRemove, { projectId, path }),
  },
  files: {
    readDir: (checkout, path) => ipcRenderer.invoke(IpcChannel.filesReadDir, { ...checkout, path }),
    read: (checkout, path) => ipcRenderer.invoke(IpcChannel.filesRead, { ...checkout, path }),
    stat: (checkout, paths) => ipcRenderer.invoke(IpcChannel.filesStat, { ...checkout, paths }),
    write: (checkout, path, content, options) =>
      ipcRenderer.invoke(IpcChannel.filesWrite, { ...checkout, path, content, ...options }),
  },
  editor: {
    setHasUnsavedChanges: (hasUnsavedChanges) =>
      ipcRenderer.send(IpcChannel.editorUnsavedChanges, hasUnsavedChanges === true),
  },
  github: {
    getState: () => ipcRenderer.invoke(IpcChannel.authGetState),
    startSignIn: () => ipcRenderer.invoke(IpcChannel.authStart),
    cancelSignIn: () => ipcRenderer.invoke(IpcChannel.authCancel),
    signOut: () => ipcRenderer.invoke(IpcChannel.authSignOut),
    openVerificationPage: () => ipcRenderer.invoke(IpcChannel.authOpenVerification),
    retry: () => ipcRenderer.invoke(IpcChannel.authRetry),
    listRepos: () => ipcRenderer.invoke(IpcChannel.githubListRepos),
    onStateChange: (listener) => subscribe(IpcChannel.authState, listener),
  },
  clone: {
    defaults: () => ipcRenderer.invoke(IpcChannel.cloneDefaults),
    start: (request) => ipcRenderer.invoke(IpcChannel.cloneStart, request),
    cancel: () => ipcRenderer.send(IpcChannel.cloneCancel),
    onProgress: (listener) => subscribe(IpcChannel.cloneProgress, listener),
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.settingsGet),
    update: (change) => ipcRenderer.invoke(IpcChannel.settingsUpdate, change),
  },
  tasks: {
    list: (projectId) => ipcRenderer.invoke(IpcChannel.tasksList, { projectId }),
    get: (projectId, number) => ipcRenderer.invoke(IpcChannel.tasksGet, { projectId, number }),
    create: (request) => ipcRenderer.invoke(IpcChannel.tasksCreate, request),
    update: (request) => ipcRenderer.invoke(IpcChannel.tasksUpdate, request),
    comment: (projectId, number, body) =>
      ipcRenderer.invoke(IpcChannel.tasksComment, { projectId, number, body }),
    openInBrowser: (projectId, number) =>
      ipcRenderer.invoke(IpcChannel.tasksOpen, { projectId, number }),
    startSession: (projectId, number, agents) =>
      ipcRenderer.invoke(IpcChannel.tasksStartSession, { projectId, number, agents }),
  },
  agentConfig: {
    read: (projectId) => ipcRenderer.invoke(IpcChannel.agentConfigRead, { projectId }),
    saveMcp: (projectId, servers, version) =>
      ipcRenderer.invoke(IpcChannel.agentConfigSaveMcp, { projectId, servers, version }),
    linkInstructions: (projectId) =>
      ipcRenderer.invoke(IpcChannel.agentConfigLinkInstructions, { projectId }),
  },
  compare: {
    changes: (projectId, worktreePaths) =>
      ipcRenderer.invoke(IpcChannel.compareChanges, { projectId, worktreePaths }),
  },
  workspace: {
    load: () => ipcRenderer.invoke(IpcChannel.workspaceLoad),
    save: (snapshot) => ipcRenderer.invoke(IpcChannel.workspaceSave, snapshot),
  },
  welcome: {
    findRepos: (scope) => ipcRenderer.invoke(IpcChannel.welcomeFindRepos, scope),
    checkAgents: () => ipcRenderer.invoke(IpcChannel.welcomeCheckAgents),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IpcChannel.dialogPickFolder),
  },
  onCommand: (listener) => subscribe(IpcChannel.appCommand, listener),
}

contextBridge.exposeInMainWorld('dugout', api)
