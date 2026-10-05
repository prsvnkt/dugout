import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export async function writeFileAtomic(
  filePath: string,
  contents: string,
  mode?: number,
  encoding: BufferEncoding = 'utf8',
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, contents, { encoding, mode: mode ?? 0o644 })
    if (mode !== undefined) await chmod(tempPath, mode)
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}
