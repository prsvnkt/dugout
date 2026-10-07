// In development the app runs inside node_modules' stock Electron.app, and macOS takes the
// menu bar title and Dock name from that bundle's Info.plist ("Electron"); the app cannot
// change them at runtime. Rename the dev bundle "Dugout Dev" so `npm run dev` (and the e2e
// tests) are never mistaken for the installed app in the Dock, Launchpad or Spotlight.
// Packaged builds get the name from `productName` instead.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const APP_BUNDLE = join('node_modules', 'electron', 'dist', 'Electron.app')
const INFO_PLIST = join(APP_BUNDLE, 'Contents', 'Info.plist')
const { productName } = JSON.parse(readFileSync('package.json', 'utf8'))
const DEV_NAME = `${productName} Dev`

if (process.platform === 'darwin' && existsSync(INFO_PLIST)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', DEV_NAME, INFO_PLIST])
  }
  // Editing Info.plist breaks the bundle's ad-hoc signature; sign it again so it stays valid.
  execFileSync('codesign', ['--force', '--sign', '-', APP_BUNDLE], { stdio: 'ignore' })
  // A new modification time makes Launch Services re-read the bundle's name.
  const now = new Date()
  utimesSync(APP_BUNDLE, now, now)
}
