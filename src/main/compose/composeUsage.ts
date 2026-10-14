import { setupUsage } from '../services/usage/setupUsage'
import type { UsageService } from '../services/usage/UsageService'
import type { AppEnv } from './appEnv'

/** Usage is a nice-to-have: if its folder cannot be set up, agents run without it. */
export async function composeUsage(env: AppEnv): Promise<UsageService | null> {
  try {
    return await setupUsage({ dataDir: env.dataDir, homeDir: env.homeDir, env: process.env })
  } catch (error) {
    console.error('[usage] could not start; token usage disabled:', error)
    return null
  }
}
