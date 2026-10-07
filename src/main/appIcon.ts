import { join } from 'node:path'
import { app, nativeImage } from 'electron'

/** Generated from resources/icon.svg by `npm run icons`. */
const ICON_FILE = join('resources', 'icon.png')

/**
 * Shows the Dugout icon in the Dock and the About panel. Unpackaged Electron otherwise shows
 * its own icon; a packaged build would take it from the bundle instead.
 */
export function applyAppIcon(): void {
  const iconPath = join(app.getAppPath(), ICON_FILE)
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.warn(`[app] icon not found at ${iconPath}; run \`npm run icons\``)
    return
  }
  app.dock?.setIcon(icon)
  app.setAboutPanelOptions({ applicationName: 'Dugout', iconPath })
}
