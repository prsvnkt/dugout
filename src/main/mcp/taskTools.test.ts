import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, test, vi } from 'vitest'
import { createTaskServer, type TaskRpc } from './taskTools'

async function connect(rpc: TaskRpc) {
  const server = createTaskServer(rpc)
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

const text = (result: unknown) =>
  (result as { content: { type: string; text: string }[] }).content[0]?.text ?? ''

describe('Dugout task tools (MCP)', () => {
  test('offers the task tools', async () => {
    const client = await connect(vi.fn())
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'comment_on_task',
      'create_task',
      'get_task',
      'list_tasks',
      'update_task',
    ])
  })

  test('routes calls to Dugout and returns its answer', async () => {
    const rpc = vi.fn<TaskRpc>(async () => ({ number: 42, status: 'in-review' }))
    const client = await connect(rpc)

    const result = await client.callTool({
      name: 'update_task',
      arguments: { number: 42, status: 'in-review' },
    })

    expect(rpc).toHaveBeenCalledWith('update', { number: 42, status: 'in-review' })
    expect(JSON.parse(text(result))).toEqual({ number: 42, status: 'in-review' })
  })

  test('reports Dugout errors to the agent as tool errors', async () => {
    const client = await connect(async () => Promise.reject(new Error('No GitHub remote')))
    const result = await client.callTool({ name: 'list_tasks', arguments: {} })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('No GitHub remote')
  })

  test('rejects invalid arguments before calling Dugout', async () => {
    const rpc = vi.fn<TaskRpc>()
    const client = await connect(rpc)
    const result = await client.callTool({ name: 'update_task', arguments: { number: 'x' } })
    expect(result.isError).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })
})
