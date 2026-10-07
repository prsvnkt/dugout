// In development the app runs inside node_modules' stock Electron.app, and macOS takes the
// menu bar title and Dock name from that bundle's Info.plist ("Electron"); the app cannot
// change them at runtime. Rename the dev bundle so `npm run dev` shows "Dugout".
// Packaged builds get the name from `productName` instead.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const APP_BUNDLE = join('node_modules', 'electron', 'dist', 'Electron.app')
const INFO_PLIST = join(APP_BUNDLE, 'Contents', 'Info.plist')
const { productName } = JSON.parse(readFileSync('package.json', 'utf8'))

if (process.platform === 'darwin' && existsSync(INFO_PLIST)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', productName, INFO_PLIST])
  }
  // Editing Info.plist breaks the bundle's ad-hoc signature; sign it again so it stays valid.
  execFileSync('codesign', ['--force', '--sign', '-', APP_BUNDLE], { stdio: 'ignore' })
  // A new modification time makes Launch Services re-read the bundle's name.
  const now = new Date()
  utimesSync(APP_BUNDLE, now, now)
}
