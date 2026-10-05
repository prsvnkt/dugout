/** A file or folder inside a checkout, addressed by its path relative to the checkout root. */
export interface DirEntry {
  readonly name: string
  readonly path: string
  readonly kind: 'file' | 'dir'
  /** Matched by .gitignore; shown dimmed. */
  readonly isIgnored: boolean
}

export interface FileContent {
  readonly path: string
  /** Empty when the file is binary or too large to open. */
  readonly content: string
  readonly mtimeMs: number
  readonly isBinary: boolean
  readonly isTooLarge: boolean
}

export interface FileStat {
  readonly path: string
  /** Null when the file no longer exists. */
  readonly mtimeMs: number | null
}

/** A file's content at a git revision: the index (staged) or HEAD. */
export interface RevisionContent {
  readonly content: string
  /** False when the file does not exist at that revision (e.g. a new file). */
  readonly exists: boolean
  readonly isBinary: boolean
}

export type GitRevision = 'HEAD' | 'INDEX'

export const MAX_OPEN_FILE_BYTES = 5 * 1024 * 1024
export const MAX_DIR_ENTRIES = 5_000
