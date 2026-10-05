export interface CloneProgress {
  /** e.g. "Receiving objects". */
  readonly phase: string
  /** 0–100, or null when git has not reported a percentage yet. */
  readonly percent: number | null
}

export interface CloneDefaults {
  /** Folder new clones go into; remembered from the last clone. */
  readonly parentDir: string
}
