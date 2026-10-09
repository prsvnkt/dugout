import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TASK_STATUSES, type TaskStatus } from '@shared/tasks'

interface TaskGroupsState {
  /** Which status groups of the Tasks list are open; Done starts collapsed. */
  readonly isOpen: Readonly<Record<TaskStatus, boolean>>
  toggle(status: TaskStatus): void
}

const DEFAULT_OPEN: Readonly<Record<TaskStatus, boolean>> = {
  'in-progress': true,
  'in-review': true,
  todo: true,
  done: false,
}

/** Saved state is untrusted: keep only a boolean per known status. */
function restoreOpen(saved: unknown): Readonly<Record<TaskStatus, boolean>> {
  const isOpen = (saved as { isOpen?: Record<string, unknown> } | undefined)?.isOpen ?? {}
  return Object.fromEntries(
    TASK_STATUSES.map((status) => {
      const value = isOpen[status]
      return [status, typeof value === 'boolean' ? value : DEFAULT_OPEN[status]]
    }),
  ) as Record<TaskStatus, boolean>
}

/** Remembered across restarts (in the renderer's local storage): a view preference only. */
export const useTaskGroupsStore = create<TaskGroupsState>()(
  persist(
    (set) => ({
      isOpen: DEFAULT_OPEN,
      toggle: (status) =>
        set((state) => ({ isOpen: { ...state.isOpen, [status]: !state.isOpen[status] } })),
    }),
    {
      name: 'dugout.tasks.groups',
      partialize: (state) => ({ isOpen: state.isOpen }),
      merge: (persisted, current) => ({ ...current, isOpen: restoreOpen(persisted) }),
    },
  ),
)
