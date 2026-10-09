import { useEffect } from 'react'
import { create } from 'zustand'
import type { ProjectContext } from '@shared/context'
import type { ProjectId } from '@shared/project'
import { dugout } from '@renderer/lib/dugout'

export interface LoadedContext {
  readonly context: ProjectContext | null
  readonly error: string | null
}

const NOT_LOADED: LoadedContext = { context: null, error: null }

interface ContextState {
  readonly byProject: Readonly<Record<ProjectId, LoadedContext>>
  /** Reloads a project's entries and proposals from main. */
  refresh(projectId: ProjectId): Promise<void>
}

export const useContextStore = create<ContextState>()((set) => ({
  byProject: {},

  async refresh(projectId) {
    const result = await dugout.context.read(projectId)
    set((state) => {
      const previous = state.byProject[projectId] ?? NOT_LOADED
      const next = result.ok
        ? { context: result.data, error: null }
        : { context: previous.context, error: result.error }
      return { byProject: { ...state.byProject, [projectId]: next } }
    })
  },
}))

/**
 * A project's context, loaded on mount and reloaded when main says it changed (an agent
 * proposed a note).
 */
export function useProjectContext(projectId: ProjectId): LoadedContext {
  const refresh = useContextStore((state) => state.refresh)
  useEffect(() => {
    void refresh(projectId)
    return dugout.context.onChange((changed) => {
      if (changed === projectId) void refresh(projectId)
    })
  }, [projectId, refresh])
  return useContextStore((state) => state.byProject[projectId] ?? NOT_LOADED)
}
