import { useEffect } from 'react'
import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { ProjectUsage } from '@shared/usage'
import { dugout } from '@renderer/lib/dugout'

/** Agents report usage after every tool call; reload a project's totals at most this often. */
const RELOAD_DELAY_MS = 1000

interface UsageState {
  /** Projects whose usage something on screen shows, loaded once asked for. */
  readonly projects: Readonly<Record<ProjectId, ProjectUsage>>
  readonly errors: Readonly<Record<ProjectId, string>>
  /** Loads (or reloads) a project's usage. */
  load(projectId: ProjectId): Promise<void>
}

export const useUsageStore = create<UsageState>()((set) => ({
  projects: {},
  errors: {},

  async load(projectId) {
    const result = await dugout.usage.project(projectId)
    if (result.ok) {
      set((state) => {
        const current = state.projects[projectId]
        const isSame = current && JSON.stringify(current) === JSON.stringify(result.data)
        if (isSame && !(projectId in state.errors)) return state
        return {
          projects: isSame ? state.projects : { ...state.projects, [projectId]: result.data },
          errors: withoutKey(state.errors, projectId),
        }
      })
      return
    }
    console.warn('[usage] could not load usage:', result.error)
    set((state) =>
      state.errors[projectId] === result.error
        ? state
        : { errors: { ...state.errors, [projectId]: result.error } },
    )
  },
}))

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  if (!(key in record)) return record
  return Object.fromEntries(Object.entries(record).filter(([other]) => other !== key))
}

const pending = new Map<ProjectId, ReturnType<typeof setTimeout>>()

/** Keeps loaded projects current as agents report usage; started once by the app. */
export function watchUsageChanges(): () => void {
  const unsubscribe = dugout.usage.onChange((projectId) => {
    if (!(projectId in useUsageStore.getState().projects) || pending.has(projectId)) return
    pending.set(
      projectId,
      setTimeout(() => {
        pending.delete(projectId)
        void useUsageStore.getState().load(projectId)
      }, RELOAD_DELAY_MS),
    )
  })
  return () => {
    unsubscribe()
    for (const timer of pending.values()) clearTimeout(timer)
    pending.clear()
  }
}

/** A project's recorded usage, loading it the first time; null until loaded. */
export function useProjectUsage(projectId: ProjectId | null): ProjectUsage | null {
  const usage = useUsageStore((state) => (projectId ? state.projects[projectId] : undefined))
  const load = useUsageStore((state) => state.load)
  const isLoaded = usage !== undefined
  useEffect(() => {
    if (projectId && !isLoaded) void load(projectId)
  }, [projectId, isLoaded, load])
  return usage ?? null
}
