import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { MAX_CONTEXT_BODY_LENGTH, MAX_CONTEXT_TITLE_LENGTH } from '@shared/context'

/** File types offered when importing a document. */
export const IMPORTABLE_EXTENSIONS = ['md', 'markdown', 'txt']
const HEADING = /^#{1,6}\s+(.+)$/m

export interface ImportedDoc {
  readonly title: string
  readonly source: string
  readonly body: string
}

/**
 * Reads a document the user picked to copy into the project's context: text only, up to the
 * entry size limit, titled by its first heading or its file name.
 */
export async function readImportedDoc(path: string): Promise<ImportedDoc> {
  const source = basename(path)
  if ((await stat(path)).size > MAX_CONTEXT_BODY_LENGTH) {
    throw new Error(`${source} is too large to import (over 100 KB).`)
  }
  const body = await readFile(path, 'utf8')
  if (body.includes('\0')) throw new Error(`${source} is not a text file.`)
  const heading = HEADING.exec(body)?.[1]?.trim()
  const title = (heading || basename(source, extname(source)) || source).slice(
    0,
    MAX_CONTEXT_TITLE_LENGTH,
  )
  return { title, source, body }
}
