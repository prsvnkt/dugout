import { DEV_PORT_RANGE } from '@shared/preview'

export interface PortRange {
  readonly first: number
  readonly last: number
}

/** Ports to try for a new dev server, in order: the range without ports already given out. */
export function candidatePorts(
  reserved: readonly number[],
  range: PortRange = DEV_PORT_RANGE,
): number[] {
  const taken = new Set(reserved)
  const size = Math.max(0, range.last - range.first + 1)
  return Array.from({ length: size }, (_, offset) => range.first + offset).filter(
    (port) => !taken.has(port),
  )
}

/**
 * The first candidate nothing on this Mac listens on. Throws when every one is busy.
 * `isFree` is a probe (a real bind in the app, a fake in tests); candidates are tried in order.
 */
export async function findFreePort(
  candidates: readonly number[],
  isFree: (port: number) => Promise<boolean>,
): Promise<number> {
  for (const port of candidates) {
    if (await isFree(port)) return port
  }
  throw new Error('No free port for the dev server. Stop another dev server and try again.')
}
