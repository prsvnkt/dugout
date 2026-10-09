import { create } from 'zustand'
import type { ProjectAddRequest } from '@shared/ipc/contract'
import type { Project, ProjectId } from '@shared/project'
import type { TaskSource } from '@shared/tasks'
import { unwrap } from '@shared/result'
import type { WorktreeSetup } from '@shared/worktreeSetup'
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
  /** Saves the project's dev command (null or blank clears it). Throws a user-facing message. */
  setDevCommand(id: ProjectId, command: string | null): Promise<void>
  /** Saves Verify on Stop's command (null or blank turns it off). Throws a user-facing message. */
  setCheckCommand(id: ProjectId, command: string | null): Promise<void>
  /** Where the project's tasks live. Throws with a user-facing message on failure. */
  setTaskSource(id: ProjectId, source: TaskSource): Promise<void>
  /** Saves what new worktrees copy and run (null turns it off). Throws a user-facing message. */
  setWorktreeSetup(id: ProjectId, setup: WorktreeSetup | null): Promise<void>
  select(id: ProjectId): void
  selectIndex(index: number): void
}

function replaceProject(projects: readonly Project[], updated: Project): readonly Project[] {
  return projects.map((project) => (project.id === updated.id ? updated : project))
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

  async setDevCommand(id, command) {
    const updated = unwrap(await dugout.projects.setDevCommand(id, command))
    set((state) => ({ projects: replaceProject(state.projects, updated) }))
  },

  async setCheckCommand(id, command) {
    const updated = unwrap(await dugout.projects.setCheckCommand(id, command))
    set((state) => ({ projects: replaceProject(state.projects, updated) }))
  },

  async setTaskSource(id, source) {
    const updated = unwrap(await dugout.projects.setTaskSource(id, source))
    set((state) => ({ projects: replaceProject(state.projects, updated) }))
  },

  async setWorktreeSetup(id, setup) {
    const updated = unwrap(await dugout.projects.setWorktreeSetup(id, setup))
    set((state) => ({ projects: replaceProject(state.projects, updated) }))
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
