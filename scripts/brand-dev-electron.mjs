// In development the app runs inside node_modules' stock Electron.app, and macOS takes the
// menu bar title and Dock name from that bundle's Info.plist ("Electron"); the app cannot
// change them at runtime. Rename the dev bundle "Dugout Dev" so `npm run dev` (and the e2e
// tests) are never mistaken for the installed app in the Dock, Launchpad or Spotlight.
// Packaged builds get the name from `productName` instead.
//
// This is cosmetic, so it never fails an install: any error is a warning, and CI (which never
// looks at the Dock) skips it. Running it again just rewrites the same name.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

const APP_BUNDLE = join('node_modules', 'electron', 'dist', 'Electron.app')
const INFO_PLIST = join(APP_BUNDLE, 'Contents', 'Info.plist')

/** @param {string} reason */
function skip(reason) {
  console.warn(`[brand-dev-electron] skipped: ${reason}`)
  process.exit(0)
}

function brand() {
  /** @type {{ productName: string }} */
  const { productName } = JSON.parse(readFileSync('package.json', 'utf8'))
  const devName = `${productName} Dev`
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    execFileSync('plutil', ['-replace', key, '-string', devName, INFO_PLIST], { stdio: 'pipe' })
  }
  // Editing Info.plist breaks the bundle's ad-hoc signature; sign it again so it stays valid.
  execFileSync('codesign', ['--force', '--sign', '-', APP_BUNDLE], { stdio: 'pipe' })
  // A new modification time makes Launch Services re-read the bundle's name.
  const now = new Date()
  utimesSync(APP_BUNDLE, now, now)
}

if (process.env.CI) skip('running in CI')
if (process.platform !== 'darwin') skip('not macOS')
if (!existsSync(INFO_PLIST)) skip(`${INFO_PLIST} not found`)

try {
  brand()
} catch (error) {
  // execFileSync's error carries the tool's stderr, which says more than "Command failed".
  const stderr = /** @type {{ stderr?: Buffer }} */ (error).stderr?.toString().trim()
  skip(stderr || (error instanceof Error ? error.message : String(error)))
}
