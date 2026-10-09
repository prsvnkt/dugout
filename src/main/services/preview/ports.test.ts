import { createServer, type Server } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test } from 'vitest'
import { DEV_PORT_RANGE } from '@shared/preview'
import { isPortFree } from './portProbe'
import { candidatePorts, findFreePort } from './ports'

describe('candidatePorts', () => {
  test('lists the whole range in order when nothing is reserved', () => {
    const ports = candidatePorts([], { first: 4100, last: 4103 })

    expect(ports).toEqual([4100, 4101, 4102, 4103])
  })

  test('skips ports already given to other dev servers', () => {
    const ports = candidatePorts([4100, 4102], { first: 4100, last: 4103 })

    expect(ports).toEqual([4101, 4103])
  })

  test('ignores reserved ports outside the range', () => {
    expect(candidatePorts([3000, 9999], { first: 4100, last: 4101 })).toEqual([4100, 4101])
  })

  test('is empty when every port is reserved, or the range is empty', () => {
    expect(candidatePorts([4100, 4101], { first: 4100, last: 4101 })).toEqual([])
    expect(candidatePorts([], { first: 4101, last: 4100 })).toEqual([])
  })

  test('uses the dev port range by default', () => {
    const ports = candidatePorts([])

    expect(ports[0]).toBe(DEV_PORT_RANGE.first)
    expect(ports.at(-1)).toBe(DEV_PORT_RANGE.last)
  })
})

describe('findFreePort', () => {
  test('returns the first candidate the probe reports free', async () => {
    const busy = new Set([4100, 4101])
    const probed: number[] = []

    const port = await findFreePort([4100, 4101, 4102, 4103], async (candidate) => {
      probed.push(candidate)
      return !busy.has(candidate)
    })

    expect(port).toBe(4102)
    expect(probed).toEqual([4100, 4101, 4102])
  })

  test('throws a readable error when every candidate is busy', async () => {
    await expect(findFreePort([4100], async () => false)).rejects.toThrow('No free port')
    await expect(findFreePort([], async () => true)).rejects.toThrow('No free port')
  })
})

describe('isPortFree', () => {
  let server: Server | null = null

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
    server = null
  })

  test('reports a port something listens on as busy, and free once it stops', async () => {
    const listening = createServer()
    server = listening
    await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve))
    const { port } = listening.address() as AddressInfo

    expect(await isPortFree(port)).toBe(false)

    await new Promise<void>((resolve) => listening.close(() => resolve()))
    server = null
    expect(await isPortFree(port)).toBe(true)
  })
})
