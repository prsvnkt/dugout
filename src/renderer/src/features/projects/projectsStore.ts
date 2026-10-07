import { create } from 'zustand'
import type { ProjectAddRequest } from '@shared/ipc/contract'
import type { Project, ProjectId } from '@shared/project'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'

interface ProjectsState {
  readonly projects: readonly Project[]
  readonly selectedId: ProjectId | null
  readonly isLoaded: boolean
  readonly loadError: string | null
  load(): Promise<void>
  /** Throws with a user-facing message on failure, for the calling form to display. */
  add(request: ProjectAddRequest): Promise<Project>
  remove(id: ProjectId): Promise<void>
  select(id: ProjectId): void
  selectIndex(index: number): void
}

export const useProjectsStore = create<ProjectsState>()((set, get) => ({
  projects: [],
  selectedId: null,
  isLoaded: false,
  loadError: null,

  async load() {
    const result = await dugout.projects.list()
    if (!result.ok) {
      set({ isLoaded: true, loadError: result.error })
      return
    }
    set({ projects: result.data, selectedId: result.data[0]?.id ?? null, isLoaded: true })
  },

  async add(request) {
    const project = unwrap(await dugout.projects.add(request))
    set((state) => ({ projects: [...state.projects, project], selectedId: project.id }))
    return project
  },

  async remove(id) {
    unwrap(await dugout.projects.remove(id))
    set((state) => {
      const projects = state.projects.filter((project) => project.id !== id)
      const selectedId = state.selectedId === id ? (projects[0]?.id ?? null) : state.selectedId
      return { projects, selectedId }
    })
  },

  select(id) {
    if (get().projects.some((project) => project.id === id)) set({ selectedId: id })
  },

  selectIndex(index) {
    const project = get().projects[index]
    if (project) set({ selectedId: project.id })
  },
}))

export function useSelectedProject(): Project | null {
  return useProjectsStore(
    (state) => state.projects.find((project) => project.id === state.selectedId) ?? null,
  )
}
