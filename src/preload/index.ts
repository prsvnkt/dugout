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
  },
  dialog: {
    pickFolder: () => ipcRenderer.invoke(IpcChannel.dialogPickFolder),
  },
}

contextBridge.exposeInMainWorld('dugout', api)
