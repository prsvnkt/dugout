import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentKind } from '@shared/agents'
import { AGENT_ADAPTERS } from '../agents/registry'
import { UsageFiles } from './usageFiles'
import { UsageService, type UsageReaderSource } from './UsageService'

const USAGE_DIR = 'usage'
/** Hooks fire often while an agent works; the state is saved at most this often. */
const SAVE_DELAY_MS = 2000

/** Every agent with `hasUsage`, with the folder its transcripts must come from. */
export function usageReaders(
  homeDir: string,
  env: Readonly<Record<string, string | undefined>>,
): Partial<Record<AgentKind, UsageReaderSource>> {
  return Object.fromEntries(
    Object.values(AGENT_ADAPTERS).flatMap((adapter) =>
      adapter.usage
        ? [
            [
              adapter.info.kind,
              { reader: adapter.usage, root: adapter.usage.transcriptRoot(homeDir, env) },
            ],
          ]
        : [],
    ),
  )
}

/** The usage ledger in `<dataDir>/usage/`, loaded and ready for reports. */
export async function setupUsage(options: {
  readonly dataDir: string
  readonly homeDir: string
  readonly env: Readonly<Record<string, string | undefined>>
}): Promise<UsageService> {
  const dir = join(options.dataDir, USAGE_DIR)
  await mkdir(dir, { recursive: true })
  const service = new UsageService({
    files: new UsageFiles({ ledger: join(dir, 'ledger.jsonl'), state: join(dir, 'state.json') }),
    readers: usageReaders(options.homeDir, options.env),
    now: () => new Date(),
    scheduleSave: (save) => setTimeout(save, SAVE_DELAY_MS),
  })
  await service.load()
  return service
}
