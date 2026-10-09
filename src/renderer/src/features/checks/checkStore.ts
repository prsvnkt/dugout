import { create } from 'zustand'
import { CHECK_IDLE, type CheckStatus } from '@shared/checks'
import type { TerminalId } from '@shared/terminal'
import type { PaneId } from '@renderer/features/workspace/layout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

/** Verify on Stop results per agent terminal, as main reports them (`useTerminal` feeds this). */
interface CheckState {
  readonly byTerminal: Readonly<Record<TerminalId, CheckStatus>>
  set(terminalId: TerminalId, status: CheckStatus): void
  remove(terminalId: TerminalId): void
}

export const useCheckStore = create<CheckState>()((set) => ({
  byTerminal: {},
  set: (terminalId, status) =>
    set((state) =>
      state.byTerminal[terminalId] === status
        ? state
        : { byTerminal: { ...state.byTerminal, [terminalId]: status } },
    ),
  remove: (terminalId) =>
    set((state) => {
      if (!(terminalId in state.byTerminal)) return state
      const { [terminalId]: _removed, ...rest } = state.byTerminal
      return { byTerminal: rest }
    }),
}))

/** The check of the agent in one pane (idle when none ran). */
export function usePaneCheck(paneId: PaneId): CheckStatus {
  const terminalId = useWorkspaceStore((state) => state.terminalIds[paneId])
  return useCheckStore((state) =>
    terminalId ? (state.byTerminal[terminalId] ?? CHECK_IDLE) : CHECK_IDLE,
  )
}
