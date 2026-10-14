import { describe, expect, test, vi } from 'vitest'
import type { ContextRpcStore } from '../context/contextRpc'
import type { TaskRpcTasks } from '../tasks/taskRpc'
import { createAgentRpc, NOT_A_PROJECT, type AgentRpcDeps } from './agentRpc'

const PROJECT = { id: 'p1', rootPath: '/repo' }

function setup(overrides: Partial<AgentRpcDeps> = {}) {
  const tasks = {
    list: vi.fn(async () => []),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    comment: vi.fn(),
  }
  const context = {
    entries: vi.fn(async () => []),
    get: vi.fn(async () => null),
    propose: vi.fn(async () => ({ id: 'n1', title: 't', body: 'b', proposedBy: 'codex' })),
  }
  const terminals = {
    projectOf: vi.fn((id: string) => (id === 't1' ? PROJECT.id : null)),
    agentInfo: vi.fn(() => ({ kind: 'codex' })),
  }
  const onContextChanged = vi.fn()
  const deps: AgentRpcDeps = {
    terminals: () => terminals as unknown as ReturnType<AgentRpcDeps['terminals']>,
    findProject: (id) => (id === PROJECT.id ? PROJECT : undefined),
    tasks: tasks as unknown as TaskRpcTasks,
    context: context as unknown as ContextRpcStore,
    onContextChanged,
    ...overrides,
  }
  return { rpc: createAgentRpc(deps), tasks, context, onContextChanged }
}

describe('createAgentRpc', () => {
  test('routes task methods to the task service, scoped to the terminal project', async () => {
    const { rpc, tasks } = setup()

    await rpc('t1', 'list', {})

    expect(tasks.list).toHaveBeenCalledWith('p1')
  })

  test('routes context methods with the calling agent and reports a proposed note', async () => {
    const { rpc, context, onContextChanged } = setup()

    await rpc('t1', 'context.addNote', { title: 'Tests', body: 'Run npm test' })

    expect(context.propose).toHaveBeenCalledWith(
      PROJECT,
      { title: 'Tests', body: 'Run npm test' },
      'codex',
    )
    expect(onContextChanged).toHaveBeenCalledWith('p1')
  })

  test('refuses terminals outside a project', async () => {
    const { rpc } = setup()
    await expect(rpc('other', 'list', {})).rejects.toThrow(NOT_A_PROJECT)
  })

  test('refuses calls before the terminal manager exists', async () => {
    const { rpc } = setup({ terminals: () => null })
    await expect(rpc('t1', 'list', {})).rejects.toThrow(NOT_A_PROJECT)
  })

  test('refuses context calls when the project is gone', async () => {
    const { rpc, context } = setup({ findProject: () => undefined })
    await expect(rpc('t1', 'context.list', {})).rejects.toThrow(NOT_A_PROJECT)
    expect(context.entries).not.toHaveBeenCalled()
  })
})
