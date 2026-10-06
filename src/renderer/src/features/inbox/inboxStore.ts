import { create } from 'zustand'

interface InboxState {
  readonly isOpen: boolean
  toggle(): void
  close(): void
}

export const useInboxStore = create<InboxState>()((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  close: () => set({ isOpen: false }),
}))
