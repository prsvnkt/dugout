import { open } from 'node:fs/promises'

/** Never read more than this at once; a longer backlog is read over several calls. */
const MAX_READ_BYTES = 32 * 1024 * 1024
const NEWLINE = 0x0a

export interface CompleteLines {
  readonly lines: readonly string[]
  /** Bytes of `buffer` the lines cover, up to and including the last newline. */
  readonly consumed: number
}

/** The complete lines in `buffer`; a last line without its newline is left for the next read. */
export function splitCompleteLines(buffer: Buffer): CompleteLines {
  const end = buffer.lastIndexOf(NEWLINE)
  if (end === -1) return { lines: [], consumed: 0 }
  const lines = buffer.subarray(0, end).toString('utf8').split('\n')
  return { lines, consumed: end + 1 }
}

export interface LinesRead {
  readonly lines: readonly string[]
  /** Where the next read starts. */
  readonly nextOffset: number
}

/**
 * Reads the complete lines written after `offset`. A file that shrank was replaced or rewritten,
 * so it is read again from the start (counting each message once makes that safe).
 */
export async function readLinesFrom(path: string, offset: number): Promise<LinesRead> {
  const file = await open(path, 'r')
  try {
    const { size } = await file.stat()
    const start = size < offset ? 0 : offset
    const length = Math.min(size - start, MAX_READ_BYTES)
    if (length <= 0) return { lines: [], nextOffset: start }
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await file.read(buffer, 0, length, start)
    const { lines, consumed } = splitCompleteLines(buffer.subarray(0, bytesRead))
    // One line longer than a whole read cannot be usage we understand; step over it.
    const isStuck = consumed === 0 && bytesRead === MAX_READ_BYTES
    return { lines, nextOffset: start + (isStuck ? bytesRead : consumed) }
  } finally {
    await file.close()
  }
}
