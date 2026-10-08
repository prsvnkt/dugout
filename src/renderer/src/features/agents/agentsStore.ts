import { create } from 'zustand'

interface AgentsState {
  /** True when the sidebar's Agents list is minimised to its header. */
  readonly isCollapsed: boolean
  toggleCollapsed(): void
  setCollapsed(isCollapsed: boolean): void
}

export const useAgentsStore = create<AgentsState>()((set) => ({
  isCollapsed: false,
  toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  setCollapsed: (isCollapsed) =>
    set((state) => (state.isCollapsed === isCollapsed ? state : { isCollapsed })),
}))
