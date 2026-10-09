import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import { settleLaunches, type Launch, type SlotAgent } from './slots'

const NO_LAUNCHES: readonly Launch[] = []

interface TaskQueueState {
  /** Task agents being started per project, which hold a slot until they get going. */
  readonly launches: Readonly<Record<ProjectId, readonly Launch[]>>
  /** Why the last queued task failed to start, per project. */
  readonly errors: Readonly<Record<ProjectId, string>>
  /** "Start agent" (or the queue) is creating the task's worktree. */
  beginLaunch(projectId: ProjectId, number: number): void
  /** Its agents are open. */
  markStarted(projectId: ProjectId, number: number): void
  /** It failed: the slot is free again. */
  endLaunch(projectId: ProjectId, number: number): void
  /** Forgets starts whose agents have worked, finished or closed. */
  settle(projectId: ProjectId, agents: readonly SlotAgent[]): void
  setError(projectId: ProjectId, error: string | null): void
}

export const useTaskQueueStore = create<TaskQueueState>()((set) => {
  /** Applies a change to one project's starts; unchanged results leave state alone. */
  const updateLaunches = (
    projectId: ProjectId,
    change: (launches: readonly Launch[]) => readonly Launch[],
  ) =>
    set((state) => {
      const current = state.launches[projectId] ?? NO_LAUNCHES
      const next = change(current)
      return next === current ? state : { launches: { ...state.launches, [projectId]: next } }
    })
  const without = (launches: readonly Launch[], number: number) =>
    launches.filter((launch) => launch.number !== number)

  return {
    launches: {},
    errors: {},
    beginLaunch: (projectId, number) =>
      updateLaunches(projectId, (launches) => [
        ...without(launches, number),
        { number, phase: 'requesting' },
      ]),
    markStarted: (projectId, number) =>
      updateLaunches(projectId, (launches) =>
        launches.map((launch) =>
          launch.number === number ? { number, phase: 'started' } : launch,
        ),
      ),
    endLaunch: (projectId, number) =>
      updateLaunches(projectId, (launches) =>
        launches.some((launch) => launch.number === number) ? without(launches, number) : launches,
      ),
    settle: (projectId, agents) =>
      updateLaunches(projectId, (launches) => settleLaunches(launches, agents)),
    setError: (projectId, error) =>
      set((state) => {
        if ((state.errors[projectId] ?? null) === error) return state
        const { [projectId]: _previous, ...rest } = state.errors
        return { errors: error === null ? rest : { ...rest, [projectId]: error } }
      }),
  }
})

export function useProjectLaunches(projectId: ProjectId): readonly Launch[] {
  return useTaskQueueStore((state) => state.launches[projectId] ?? NO_LAUNCHES)
}
