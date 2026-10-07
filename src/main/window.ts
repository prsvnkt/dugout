import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

const WINDOW_BACKGROUND = '#0f1115'
const DEFAULT_SIZE = { width: 1400, height: 900 }
const MIN_SIZE = { minWidth: 800, minHeight: 500 }
/**
 * Centres the traffic lights on the project tab row (--tab-height at the bottom of the
 * 40px --titlebar-height), so they line up with the tabs and the "+".
 */
const TRAFFIC_LIGHT_POSITION = { x: 18, y: 18 }

function isAllowedNavigation(url: string, devServerUrl: string | undefined): boolean {
  return devServerUrl !== undefined && url.startsWith(devServerUrl)
}

export function createMainWindow(): BrowserWindow {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL

  const window = new BrowserWindow({
    ...DEFAULT_SIZE,
    ...MIN_SIZE,
    show: false,
    backgroundColor: WINDOW_BACKGROUND,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  // Never let the renderer open windows or navigate away; send links to the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, devServerUrl)) event.preventDefault()
  })

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}
