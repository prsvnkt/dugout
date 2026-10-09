import { createServer } from 'node:net'

/** Hosts a dev server may listen on; a port counts as free only if both can bind it. */
const PROBE_HOSTS = ['127.0.0.1', '::'] as const

function canListen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) =>
      // No IPv6 on this Mac means nothing can listen there either.
      resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'),
    )
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

/** True when nothing listens on `port`, on the loopback or on all interfaces. */
export async function isPortFree(port: number): Promise<boolean> {
  for (const host of PROBE_HOSTS) {
    if (!(await canListen(port, host))) return false
  }
  return true
}
