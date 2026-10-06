import { describe, expect, test, vi } from 'vitest'
import type { Project } from '@shared/project'
import { TaskService, type TaskServiceDeps } from './TaskService'

const PROJECT: Project = {
  id: 'p1',
  name: 'app',
  rootPath: '/repo',
  color: 'teal',
  createdAt: '2026-10-05T00:00:00Z',
}

function setup(remote: string | null, overrides: Partial<TaskServiceDeps> = {}) {
  const issues = {
    list: vi.fn(async () => []),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(async () => ({ number: 5, status: 'in-progress' })),
    comment: vi.fn(),
  }
  const deps: TaskServiceDeps = {
    findProject: (id) => (id === 'p1' ? PROJECT : undefined),
    remoteUrl: async () => remote,
    withToken: async (call) => call('tok'),
    issues: issues as unknown as TaskServiceDeps['issues'],
    webBaseUrl: 'https://github.com',
    ...overrides,
  }
  return { service: new TaskService(deps), issues }
}

describe('TaskService', () => {
  test('lists the issues of the project GitHub repository', async () => {
    const { service, issues } = setup('git@github.com:octo/app.git')
    await service.list('p1')
    expect(issues.list).toHaveBeenCalledWith('tok', { owner: 'octo', name: 'app' })
  })

  test('explains when a project has no GitHub remote', async () => {
    const { service } = setup('git@gitlab.com:octo/app.git')
    await expect(service.list('p1')).rejects.toThrow('GitHub Issues')
    const { service: noRemote } = setup(null)
    await expect(noRemote.list('p1')).rejects.toThrow('GitHub Issues')
  })

  test('rejects unknown projects', async () => {
    const { service } = setup('git@github.com:octo/app.git')
    await expect(service.list('nope')).rejects.toThrow('Project not found')
  })

  test('updates a task through the token', async () => {
    const { service, issues } = setup('https://github.com/octo/app.git')
    await service.update('p1', 5, { status: 'in-progress' })
    expect(issues.update).toHaveBeenCalledWith('tok', { owner: 'octo', name: 'app' }, 5, {
      status: 'in-progress',
    })
  })
})
