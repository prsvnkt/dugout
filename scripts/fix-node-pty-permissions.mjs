// node-pty's prebuilt `spawn-helper` can ship without the executable bit on macOS,
// which makes every spawn fail with "posix_spawnp failed". Restore it after install.
// A missing node-pty or helper cannot abort the install: every path is checked with existsSync.
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PREBUILDS_DIR = join('node_modules', 'node-pty', 'prebuilds')
const EXECUTABLE_MODE = 0o755

if (process.platform === 'darwin' && existsSync(PREBUILDS_DIR)) {
  for (const platformDir of readdirSync(PREBUILDS_DIR)) {
    const helperPath = join(PREBUILDS_DIR, platformDir, 'spawn-helper')
    if (existsSync(helperPath)) chmodSync(helperPath, EXECUTABLE_MODE)
  }
}
