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

/** The sign-in dialog copies the device code with `navigator.clipboard.writeText`. */
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write'])

function isAllowedNavigation(url: string, devServerUrl: string | undefined): boolean {
  return devServerUrl !== undefined && url.startsWith(devServerUrl)
}

/** `devServerUrl` is electron-vite's dev server, from `readOverrides` (never set when packaged). */
export function createMainWindow(devServerUrl: string | undefined): BrowserWindow {
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
  const blockNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!isAllowedNavigation(url, devServerUrl)) event.preventDefault()
  }
  window.webContents.on('will-navigate', blockNavigation)
  window.webContents.on('will-redirect', blockNavigation)
  // The UI needs no camera, microphone, location, notifications etc.; only copying to the clipboard.
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission)),
  )

  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return window
}
