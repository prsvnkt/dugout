import { join } from 'node:path'
import { SHARED_CONTEXT_DIR } from '@shared/context'
import { ContextStore } from '../services/context/ContextStore'
import { checkoutFolder, diskFolder } from '../services/context/entryFolders'
import type { FileService } from '../services/files/FileService'
import type { AppEnv } from './appEnv'

/** Private context entries and agents' proposals, per project. */
const CONTEXT_DIR = 'context'
const PROPOSED_DIR = 'proposed'

/**
 * Project context for agents: shared entries in the checkout's `.dugout/context/`, private notes
 * and proposals in app data.
 */
export function composeContext(env: AppEnv, files: FileService): ContextStore {
  return new ContextStore({
    folder: (project, kind) => {
      if (kind === 'shared') return checkoutFolder(files, project.rootPath, SHARED_CONTEXT_DIR)
      const privateDir = join(env.dataDir, CONTEXT_DIR, project.id)
      return diskFolder(kind === 'proposed' ? join(privateDir, PROPOSED_DIR) : privateDir)
    },
    hashPath: (root, path) => files.hashPath(root, path),
    now: () => new Date(),
  })
}
