import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_CONTEXT_BODY_LENGTH } from '@shared/context'
import type { FileService } from '../files/FileService'
import { writeFileAtomic } from '../projects/atomicWrite'
import type { EntryFolder } from './ContextStore'

/** Entry files larger than this are left out (a body plus its front matter). */
const MAX_ENTRY_FILE_BYTES = MAX_CONTEXT_BODY_LENGTH * 4

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/** A folder inside the checkout, reached only through `FileService` (path-safe). */
export function checkoutFolder(files: FileService, root: string, dir: string): EntryFolder {
  const path = (name: string) => `${dir}/${name}`
  return {
    names: () => files.fileNames(root, dir),
    async read(name) {
      const file = await files.readFile(root, path(name)).catch((error: unknown) => {
        if (isMissing(error)) return null
        throw error
      })
      if (!file || file.isBinary || file.isTooLarge || file.content.length > MAX_ENTRY_FILE_BYTES)
        return null
      return { content: file.content, modifiedAt: new Date(file.mtimeMs).toISOString() }
    },
    write: (name, content) => files.writeText(root, path(name), content),
    remove: (name) => files.remove(root, path(name)),
  }
}

/**
 * A private folder in app data. Names come from validated entry ids (no slashes or `..`),
 * so they stay inside it.
 */
export function diskFolder(dir: string): EntryFolder {
  return {
    async names() {
      try {
        const dirents = await readdir(dir, { withFileTypes: true })
        return dirents.filter((dirent) => dirent.isFile()).map((dirent) => dirent.name)
      } catch (error) {
        if (isMissing(error)) return []
        throw error
      }
    },
    async read(name) {
      try {
        const info = await stat(join(dir, name))
        if (info.size > MAX_ENTRY_FILE_BYTES) return null
        const content = await readFile(join(dir, name), 'utf8')
        return { content, modifiedAt: info.mtime.toISOString() }
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async write(name, content) {
      await mkdir(dir, { recursive: true, mode: 0o700 })
      await writeFileAtomic(join(dir, name), content, 0o600)
    },
    remove: (name) => rm(join(dir, name), { force: true }),
  }
}
