import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, test, vi } from 'vitest'
import { createDugoutServer } from './dugoutServer'
import {
  DUGOUT_TOOLS,
  PRE_APPROVED_TOOLS,
  toolAnnotations,
  type DugoutToolName,
} from './toolAccess'

const WRITE_TOOLS = ['create_task', 'create_tasks', 'update_task', 'comment_on_task']

async function listTools() {
  const server = createDugoutServer(vi.fn())
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return (await client.listTools()).tools
}

describe('Dugout tool access', () => {
  test('pre-approves only tools that read or propose', () => {
    expect([...PRE_APPROVED_TOOLS].sort()).toEqual([
      'add_note',
      'get_context',
      'get_task',
      'list_context',
      'list_tasks',
      'search_context',
    ])
    for (const tool of WRITE_TOOLS) expect(PRE_APPROVED_TOOLS).not.toContain(tool)
  })

  test('every tool the server offers is declared, so a new one cannot skip the access check', async () => {
    const names = (await listTools()).map((tool) => tool.name).sort()
    expect(names).toEqual(Object.keys(DUGOUT_TOOLS).sort())
  })

  test('the server annotates every tool from its declared access', async () => {
    for (const tool of await listTools()) {
      const expected = toolAnnotations(tool.name as DugoutToolName)
      expect(tool.annotations, tool.name).toEqual(expected)
    }
  })

  test('only read tools say they are read-only; writes say they reach outside Dugout', () => {
    expect(toolAnnotations('list_tasks')).toMatchObject({ readOnlyHint: true })
    expect(toolAnnotations('add_note')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    })
    for (const tool of WRITE_TOOLS) {
      expect(toolAnnotations(tool as DugoutToolName)).toEqual({
        readOnlyHint: false,
        openWorldHint: true,
      })
    }
  })
})
