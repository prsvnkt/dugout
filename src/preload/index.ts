import { contextBridge, ipcRenderer } from 'electron'
import { createDugoutApi } from './api'

contextBridge.exposeInMainWorld('dugout', createDugoutApi(ipcRenderer))
