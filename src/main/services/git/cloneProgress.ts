import type { CloneProgress } from '@shared/clone'

const PERCENT_LINE = /^(?:remote:\s*)?([A-Za-z][A-Za-z ]+?):\s+(\d{1,3})%/
const CLONING_INTO = /^Cloning into '(.+)'\.\.\./

/** The most recent progress update in a chunk of `git clone --progress` stderr. */
export function parseCloneProgress(chunk: string): CloneProgress | null {
  const lines = chunk
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines.reverse()) {
    const percent = PERCENT_LINE.exec(line)
    if (percent?.[1] && percent[2]) return { phase: percent[1].trim(), percent: Number(percent[2]) }
    const cloning = CLONING_INTO.exec(line)
    if (cloning?.[1]) return { phase: `Cloning into ${cloning[1]}`, percent: null }
  }
  return null
}
