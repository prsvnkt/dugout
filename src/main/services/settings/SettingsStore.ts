import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { EXTERNAL_APP_IDS } from '@shared/openIn'
import { AGENT_KINDS } from '@shared/terminal'
import { writeFileAtomic } from '../projects/atomicWrite'

const settingsSchema = z.object({
  version: z.literal(1),
  /** Folder new clones go into, remembered from the last clone. */
  cloneParentDir: z.string().min(1).optional(),
  /** The agent the start screen's prompt box sends work to. */
  defaultAgent: z.enum(AGENT_KINDS).optional(),
  /** The app a folder was last opened in from "Open in…". */
  openInApp: z.enum(EXTERNAL_APP_IDS).optional(),
})

export type Settings = z.infer<typeof settingsSchema>
export type SettingsUpdate = Partial<Omit<Settings, 'version'>>

const DEFAULTS: Settings = { version: 1 }

/** Small app preferences in settings.json. Invalid files fall back to defaults. */
export class SettingsStore {
  constructor(private readonly deps: { readonly filePath: string }) {}

  async load(): Promise<Settings> {
    const raw = await readFile(this.deps.filePath, 'utf8').catch(() => null)
    if (raw === null) return DEFAULTS
    try {
      const parsed = settingsSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    } catch {
      // fall through to defaults
    }
    console.warn(`[settings] ${this.deps.filePath} is invalid; using defaults`)
    return DEFAULTS
  }

  async update(change: SettingsUpdate): Promise<Settings> {
    const next = { ...(await this.load()), ...change }
    await writeFileAtomic(this.deps.filePath, `${JSON.stringify(next, null, 2)}\n`)
    return next
  }
}
