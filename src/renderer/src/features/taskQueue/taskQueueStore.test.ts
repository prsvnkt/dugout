import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Project } from '@shared/project'
import { ok } from '@shared/result'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { useTaskStore } from '@renderer/features/tasks/taskStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useTaskQueueStore } from './taskQueueStore'
import { runTaskQueues } from './useTaskQueueRunner'

const PROJECT = 'project-1'
const initialQueue = useTaskQueueStore.getState()
const initialProjects = useProjectsStore.getState()
const initialTasks = useTaskStore.getState()
const initialWorkspace = useWorkspaceStore.getState()

const queue = () => useTaskQueueStore.getState()

const project: Project = {
  id: PROJECT,
  name: 'repo',
  rootPath: '/repo',
  color: 'blue',
  createdAt: '2026-01-01T00:00:00Z',
  maxAgents: 1,
  taskQueue: [{ number: 5, key: '#5', title: 'Task 5', agent: 'claude' }],
}

beforeEach(() => {
  useTaskQueueStore.setState(initialQueue, true)
  useProjectsStore.setState(initialProjects, true)
  useTaskStore.getState().reset(PROJECT)
  useTaskStore.setState(initialTasks, true)
  useWorkspaceStore.setState(initialWorkspace, true)
})

describe('taskQueueStore', () => {
  test('a launch is requesting until its agents open, then started', () => {
    // Act
    queue().beginLaunch(PROJECT, 5)
    queue().markStarted(PROJECT, 5)

    // Assert
    expect(queue().launches[PROJECT]).toEqual([{ number: 5, phase: 'started' }])
  })

  test('beginning the same task again keeps one launch for it', () => {
    // Act
    queue().beginLaunch(PROJECT, 5)
    queue().beginLaunch(PROJECT, 5)

    // Assert
    expect(queue().launches[PROJECT]).toEqual([{ number: 5, phase: 'requesting' }])
  })

  test('ending a launch frees it; ending an unknown one changes nothing', () => {
    // Arrange
    queue().beginLaunch(PROJECT, 5)
    queue().endLaunch(PROJECT, 5)
    const before = queue()

    // Act
    queue().endLaunch(PROJECT, 5)

    // Assert
    expect(before.launches[PROJECT]).toEqual([])
    expect(queue()).toBe(before)
  })

  test('settle forgets a started launch once its agent has worked', () => {
    // Arrange
    queue().beginLaunch(PROJECT, 5)
    queue().markStarted(PROJECT, 5)

    // Act
    queue().settle(PROJECT, [{ activity: 'working', taskNumber: 5 }])

    // Assert
    expect(queue().launches[PROJECT]).toEqual([])
  })

  test('setError with an unchanged error changes nothing', () => {
    // Arrange
    queue().setError(PROJECT, 'Could not start #5')
    const before = queue()

    // Act
    queue().setError(PROJECT, 'Could not start #5')

    // Assert
    expect(queue()).toBe(before)
  })

  test('setError with null clears the error, and clearing again changes nothing', () => {
    // Arrange
    queue().setError(PROJECT, 'Could not start #5')
    queue().setError(PROJECT, null)
    const cleared = queue()

    // Act
    queue().setError(PROJECT, null)

    // Assert
    expect(cleared.errors).toEqual({})
    expect(queue()).toBe(cleared)
  })
})

describe('runTaskQueues', () => {
  function fakeStarts() {
    const startSession = vi.fn(() => new Promise<never>(() => {}))
    const changeTaskQueue = vi.fn(async () => ok({ ...project, taskQueue: undefined }))
    setFakeDugout({
      tasks: { startSession, list: async () => ok([]) },
      projects: { changeTaskQueue },
    })
    useProjectsStore.setState({ projects: [project] })
    return { startSession, changeTaskQueue }
  }

  test('starts nothing until saved agents are restored', () => {
    // Arrange
    const { startSession, changeTaskQueue } = fakeStarts()

    // Act
    runTaskQueues(useWorkspaceStore.getState().isRestored, [project], {})

    // Assert
    expect(startSession).not.toHaveBeenCalled()
    expect(changeTaskQueue).not.toHaveBeenCalled()
    expect(queue().launches[PROJECT]).toBeUndefined()
  })

  test('once restored, starts the next queued task and takes it off the queue', () => {
    // Arrange
    const { startSession, changeTaskQueue } = fakeStarts()
    useWorkspaceStore.getState().markRestored()

    // Act
    runTaskQueues(useWorkspaceStore.getState().isRestored, [project], {})

    // Assert
    expect(startSession).toHaveBeenCalledWith(PROJECT, 5, ['claude'])
    expect(changeTaskQueue).toHaveBeenCalledWith(PROJECT, { kind: 'remove', number: 5 })
    expect(queue().launches[PROJECT]).toEqual([{ number: 5, phase: 'requesting' }])
  })

  test('starts nothing while every agent slot is busy', () => {
    // Arrange
    const { startSession } = fakeStarts()
    useWorkspaceStore.getState().addPane(PROJECT, 'claude')
    const paneId = useWorkspaceStore.getState().layouts[PROJECT]?.panes[0]?.id ?? ''
    useWorkspaceStore.getState().setActivity(paneId, 'working')

    // Act
    runTaskQueues(true, [project], useWorkspaceStore.getState().layouts)

    // Assert
    expect(startSession).not.toHaveBeenCalled()
  })
})
