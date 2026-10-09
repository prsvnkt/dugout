import { describe, expect, test, vi } from 'vitest'
import type { Project } from '@shared/project'
import type { TaskSource } from '@shared/tasks'
import { TaskService, type TaskServiceDeps } from './TaskService'

const PROJECT: Project = {
  id: 'p1',
  name: 'app',
  rootPath: '/repo',
  color: 'teal',
  createdAt: '2026-10-05T00:00:00Z',
}

function setup(remote: string | null, taskSource?: TaskSource) {
  const project: Project = taskSource ? { ...PROJECT, taskSource } : PROJECT
  const issues = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ url: 'https://github.com/octo/app/issues/5' })),
    create: vi.fn(),
    update: vi.fn(async () => ({ number: 5, status: 'in-progress' })),
    comment: vi.fn(),
  }
  const linearIssues = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ url: 'https://linear.app/acme/issue/ENG-5/x' })),
    create: vi.fn(),
    update: vi.fn(),
    comment: vi.fn(),
  }
  const deps: TaskServiceDeps = {
    findProject: (id) => (id === 'p1' ? project : undefined),
    remoteUrl: async () => remote,
    github: {
      withToken: async (call) => call('tok'),
      issues: issues as unknown as TaskServiceDeps['github']['issues'],
      webBaseUrl: 'https://github.com',
    },
    linear: {
      withKey: async (call) => call('lin_key'),
      issues: linearIssues as unknown as TaskServiceDeps['linear']['issues'],
      webOrigin: 'https://linear.app',
    },
  }
  return { service: new TaskService(deps), issues, linearIssues }
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

  test('a Linear project uses its team with the Linear key, whatever its remote', async () => {
    const { service, issues, linearIssues } = setup(null, { kind: 'linear', teamKey: 'ENG' })

    await service.list('p1')
    await service.update('p1', 5, { status: 'done' })
    await service.comment('p1', 5, 'Done.')

    expect(linearIssues.list).toHaveBeenCalledWith('lin_key', 'ENG')
    expect(linearIssues.update).toHaveBeenCalledWith('lin_key', 'ENG', 5, { status: 'done' })
    expect(linearIssues.comment).toHaveBeenCalledWith('lin_key', 'ENG', 5, 'Done.')
    expect(issues.list).not.toHaveBeenCalled()
  })

  test('writes task keys the way the source does', () => {
    expect(setup(null).service.keyFor('p1', 12)).toBe('#12')
    expect(setup(null, { kind: 'linear', teamKey: 'ENG' }).service.keyFor('p1', 12)).toBe('ENG-12')
  })

  test('opens task pages only on the source’s own site', async () => {
    const github = setup('git@github.com:octo/app.git')
    await expect(github.service.webUrl('p1', 5)).resolves.toBe(
      'https://github.com/octo/app/issues/5',
    )

    const linear = setup(null, { kind: 'linear', teamKey: 'ENG' })
    await expect(linear.service.webUrl('p1', 5)).resolves.toBe(
      'https://linear.app/acme/issue/ENG-5/x',
    )

    linear.linearIssues.get.mockResolvedValueOnce({ url: 'https://evil.example/ENG-5' })
    await expect(linear.service.webUrl('p1', 5)).rejects.toThrow('Unexpected task URL')
  })
})
