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
    update: (request) => ipcRenderer.invoke(IpcChannel.projectUpdate, request),
    remove: (id) => ipcRenderer.invoke(IpcChannel.projectRemove, { id }),
  },
  git: {
    status: (checkout) => ipcRenderer.invoke(IpcChannel.gitStatus, checkout),
    diff: (checkout, path, staged) =>
      ipcRenderer.invoke(IpcChannel.gitDiff, { ...checkout, path, staged }),
    stage: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitStage, { ...checkout, paths }),
    unstage: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitUnstage, { ...checkout, paths }),
    discard: (checkout, paths) => ipcRenderer.invoke(IpcChannel.gitDiscard, { ...checkout, paths }),
    commit: (checkout, message) =>
      ipcRenderer.invoke(IpcChannel.gitCommit, { ...checkout, message }),
    push: (checkout) => ipcRenderer.invoke(IpcChannel.gitPush, checkout),
    openPullRequest: (checkout) => ipcRenderer.invoke(IpcChannel.gitOpenPullRequest, checkout),
  },
  worktrees: {
    list: (projectId) => ipcRenderer.invoke(IpcChannel.worktreeList, { projectId }),
    create: (projectId) => ipcRenderer.invoke(IpcChannel.worktreeCreate, { projectId }),
    remove: (projectId, path) => ipcRenderer.invoke(IpcChannel.worktreeRemove, { projectId, path }),
  },
  workspace: {
    load: () => ipcRenderer.invoke(IpcChannel.workspaceLoad),
    save: (snapshot) => ipcRenderer.invoke(IpcChannel.workspaceSave, snapshot),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IpcChannel.dialogPickFolder),
  },
  onCommand: (listener) => subscribe(IpcChannel.appCommand, listener),
}

contextBridge.exposeInMainWorld('dugout', api)
