import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import {
  EXTERNAL_APP_IDS,
  EXTERNAL_APP_LABEL,
  type ExternalAppId,
  type OpenInApps,
} from '@shared/openIn'
import type { SettingsStore } from '../settings/SettingsStore'

/** macOS app names, for `open -a` and to find `<name>.app` in the applications folders. */
const APP_NAME: Readonly<Record<ExternalAppId, string>> = {
  vscode: 'Visual Studio Code',
  cursor: 'Cursor',
  zed: 'Zed',
  finder: 'Finder',
}

/** Finder ships with macOS (in CoreServices, not /Applications), so it is always offered. */
const ALWAYS_INSTALLED: ReadonlySet<ExternalAppId> = new Set(['finder'])

export interface OpenInServiceDeps {
  /** Folders apps are installed in, e.g. /Applications and ~/Applications. */
  readonly applicationDirs: readonly string[]
  /** Runs macOS `open` with these arguments, never through a shell; rejects if it fails. */
  readonly runOpen: (args: readonly string[]) => Promise<void>
  readonly settings: Pick<SettingsStore, 'load' | 'update'>
}

async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isDirectory() ?? false
}

/**
 * Opens a checkout folder in an editor or Finder. Callers pass only folders main has already
 * checked to be a project root or a Dugout-managed worktree.
 */
export class OpenInService {
  constructor(private readonly deps: OpenInServiceDeps) {}

  async apps(): Promise<OpenInApps> {
    const [installed, settings] = await Promise.all([this.installed(), this.deps.settings.load()])
    const lastUsed = settings.openInApp
    return {
      installed,
      lastUsed: lastUsed !== undefined && installed.includes(lastUsed) ? lastUsed : null,
    }
  }

  /** Opens `folder` in `app` and remembers the choice for the menu. */
  async open(app: ExternalAppId, folder: string): Promise<void> {
    const label = EXTERNAL_APP_LABEL[app]
    if (!isAbsolute(folder) || !(await isDirectory(folder))) {
      throw new Error('That folder no longer exists.')
    }
    if (!(await this.isInstalled(app))) throw new Error(`${label} is not installed.`)
    try {
      await this.deps.runOpen(['-a', APP_NAME[app], folder])
    } catch (error) {
      console.warn(`[open-in] could not open ${label}:`, error)
      throw new Error(`Could not open the folder in ${label}.`, { cause: error })
    }
    await this.deps.settings.update({ openInApp: app })
  }

  private async installed(): Promise<ExternalAppId[]> {
    const checks = await Promise.all(EXTERNAL_APP_IDS.map((app) => this.isInstalled(app)))
    return EXTERNAL_APP_IDS.filter((_, index) => checks[index])
  }

  private async isInstalled(app: ExternalAppId): Promise<boolean> {
    if (ALWAYS_INSTALLED.has(app)) return true
    const bundle = `${APP_NAME[app]}.app`
    const found = await Promise.all(
      this.deps.applicationDirs.map((dir) => isDirectory(join(dir, bundle))),
    )
    return found.includes(true)
  }
}
