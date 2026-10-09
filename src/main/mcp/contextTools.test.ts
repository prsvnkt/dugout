import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, test, vi } from 'vitest'
import { createDugoutServer, DUGOUT_INSTRUCTIONS } from './dugoutServer'
import type { DugoutRpc } from './rpcTool'

async function connect(rpc: DugoutRpc) {
  const server = createDugoutServer(rpc)
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

describe('Dugout context tools (MCP)', () => {
  test('offers list, get, search and add_note', async () => {
    const client = await connect(vi.fn())
    const names = (await client.listTools()).tools.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining(['list_context', 'get_context', 'search_context', 'add_note']),
    )
  })

  test('tells agents that context exists when they connect', async () => {
    const client = await connect(vi.fn())
    expect(client.getInstructions()).toBe(DUGOUT_INSTRUCTIONS)
    expect(DUGOUT_INSTRUCTIONS).toContain('list_context')
  })

  test.each([
    ['list_context', {}, 'context.list'],
    ['get_context', { id: 'deploys' }, 'context.get'],
    ['search_context', { query: 'redis' }, 'context.search'],
    ['add_note', { title: 'Tests', body: 'Need Docker' }, 'context.addNote'],
  ])('%s calls Dugout', async (name, args, method) => {
    const rpc = vi.fn<DugoutRpc>(async () => ({ ok: true }))
    const client = await connect(rpc)

    const result = await client.callTool({ name, arguments: args })

    expect(result.isError).toBeFalsy()
    expect(rpc).toHaveBeenCalledWith(method, args)
  })

  test('rejects an id that is not an entry id before calling Dugout', async () => {
    const rpc = vi.fn<DugoutRpc>()
    const client = await connect(rpc)
    const result = await client.callTool({ name: 'get_context', arguments: { id: '../x' } })
    expect(result.isError).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })
})
