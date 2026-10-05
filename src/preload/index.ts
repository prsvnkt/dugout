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
  },
  projects: {
    list: () => ipcRenderer.invoke(IpcChannel.projectList),
    add: (request) => ipcRenderer.invoke(IpcChannel.projectAdd, request),
    update: (request) => ipcRenderer.invoke(IpcChannel.projectUpdate, request),
    remove: (id) => ipcRenderer.invoke(IpcChannel.projectRemove, { id }),
  },
  git: {
    status: (projectId) => ipcRenderer.invoke(IpcChannel.gitStatus, { projectId }),
    diff: (projectId, path, staged) =>
      ipcRenderer.invoke(IpcChannel.gitDiff, { projectId, path, staged }),
    stage: (projectId, paths) => ipcRenderer.invoke(IpcChannel.gitStage, { projectId, paths }),
    unstage: (projectId, paths) => ipcRenderer.invoke(IpcChannel.gitUnstage, { projectId, paths }),
    discard: (projectId, paths) => ipcRenderer.invoke(IpcChannel.gitDiscard, { projectId, paths }),
    commit: (projectId, message) =>
      ipcRenderer.invoke(IpcChannel.gitCommit, { projectId, message }),
    push: (projectId) => ipcRenderer.invoke(IpcChannel.gitPush, { projectId }),
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IpcChannel.dialogPickFolder),
  },
  onCommand: (listener) => subscribe(IpcChannel.appCommand, listener),
}

contextBridge.exposeInMainWorld('dugout', api)
