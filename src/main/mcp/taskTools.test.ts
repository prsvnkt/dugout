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
      'create_tasks',
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

  test('says which tasks list_tasks covers', async () => {
    const client = await connect(vi.fn())
    const { tools } = await client.listTools()
    const list = tools.find((tool) => tool.name === 'list_tasks')
    expect(list?.description).toContain('open and closed')
    expect(Object.keys(list?.inputSchema.properties ?? {})).toEqual(['status', 'search'])
  })

  test('passes a search to list', async () => {
    const rpc = vi.fn<TaskRpc>(async () => ({ covers: 'all', tasks: [] }))
    const client = await connect(rpc)
    await client.callTool({ name: 'list_tasks', arguments: { search: 'dark mode' } })
    expect(rpc).toHaveBeenCalledWith('list', { search: 'dark mode' })
  })

  test('creates a task with labels, priority and related tasks', async () => {
    const rpc = vi.fn<TaskRpc>(async () => ({ number: 7, url: 'u', status: 'todo' }))
    const client = await connect(rpc)
    const args = { title: 'Fix', labels: ['bug'], priority: 'high', related: [3] }

    await client.callTool({ name: 'create_task', arguments: args })

    expect(rpc).toHaveBeenCalledWith('create', { ...args, body: '' })
  })

  test('creates several tasks in one call', async () => {
    const rpc = vi.fn<TaskRpc>(async () => ({ created: [] }))
    const client = await connect(rpc)

    await client.callTool({
      name: 'create_tasks',
      arguments: { tasks: [{ title: 'One' }, { title: 'Two', body: 'Details' }] },
    })

    expect(rpc).toHaveBeenCalledWith('createMany', {
      tasks: [
        { title: 'One', body: '' },
        { title: 'Two', body: 'Details' },
      ],
    })
  })

  test('rejects an empty batch before calling Dugout', async () => {
    const rpc = vi.fn<TaskRpc>()
    const client = await connect(rpc)
    const result = await client.callTool({ name: 'create_tasks', arguments: { tasks: [] } })
    expect(result.isError).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('can clear a priority and change labels on update', async () => {
    const rpc = vi.fn<TaskRpc>(async () => ({ number: 4, url: 'u', status: 'todo' }))
    const client = await connect(rpc)
    const args = { number: 4, priority: 'none', addLabels: ['ui'], removeLabels: ['bug'] }

    await client.callTool({ name: 'update_task', arguments: args })

    expect(rpc).toHaveBeenCalledWith('update', args)
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
