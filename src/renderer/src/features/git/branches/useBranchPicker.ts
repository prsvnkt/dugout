import { useCallback, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import type { GitCheckout } from '@shared/worktree'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { loadedDefaultAgent } from '@renderer/features/start/defaultAgentStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useDismiss } from '@renderer/lib/useDismiss'
import { useGitStore } from '../gitStore'
import {
  pickerSections,
  type PickerItem,
  type PickerMode,
  type PickerSection,
} from './pickerSections'
import { useBranches, type BranchList } from './useBranches'
import { useBusyAgents } from './useBusyAgents'

const SWITCH_MODE: PickerMode = { kind: 'switch' }

function isEnabled(item: PickerItem): boolean {
  return item.kind !== 'branch' || item.disabledReason === null
}

/**
 * Picking a branch replaces the checkout's files (switching, or a new branch from it), so busy
 * agents are at risk. Creating a branch at HEAD changes no files.
 */
function changesFiles(item: PickerItem): boolean {
  return item.kind === 'branch'
}

export interface BranchPickerState {
  readonly isOpen: boolean
  readonly toggle: () => void
  readonly query: string
  readonly setQuery: (query: string) => void
  readonly mode: PickerMode
  readonly list: BranchList
  readonly sections: readonly PickerSection[]
  readonly active: PickerItem | null
  readonly armedId: string | null
  readonly busyAgents: number
  readonly hover: (id: string) => void
  readonly activate: (item: PickerItem) => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

/** Runs a picked item's git action: the picker closes, the explorer refreshes on success. */
function useRunPick(checkout: GitCheckout, close: () => void) {
  const switchBranch = useGitStore((state) => state.switchBranch)
  const createBranch = useGitStore((state) => state.createBranch)
  const startWorktreeSession = useWorktreeStore((state) => state.startSession)
  const refreshExplorer = useExplorerStore((state) => state.refresh)
  return (item: PickerItem, mode: PickerMode) => {
    const finish = async (action: Promise<boolean>) => {
      close()
      if (await action) void refreshExplorer(checkout)
    }
    if (item.kind === 'worktree') {
      close()
      void loadedDefaultAgent().then((agent) => startWorktreeSession(checkout.projectId, agent))
      return
    }
    if (item.kind === 'create') return void finish(createBranch(checkout, item.name))
    if (item.kind !== 'branch') return
    if (mode.kind === 'base')
      return void finish(createBranch(checkout, mode.newName, item.branch.name))
    void finish(switchBranch(checkout, { kind: item.branch.kind, name: item.branch.name }))
  }
}

/** The open/closed state, search, mode and options of the branch picker. */
function usePickerOptions(checkout: GitCheckout) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<PickerMode>(SWITCH_MODE)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [showSessions, setShowSessions] = useState(false)
  const list = useBranches(checkout, isOpen)
  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setMode(SWITCH_MODE)
    setArmedId(null)
    setShowSessions(false)
  }, [])
  const sections = useMemo(
    () =>
      list.state === 'loaded' ? pickerSections(list.branches, query, mode, { showSessions }) : [],
    [list, query, mode, showSessions],
  )
  const enabled = sections.flatMap((section) => section.items).filter(isEnabled)
  // By default Enter picks the best branch match (the most recent other branch when the search
  // is empty, like `git switch -`), or creates the typed name when no branch matches.
  const fallback = enabled.find((item) => item.kind === 'branch') ?? enabled[0] ?? null
  const active = enabled.find((item) => item.id === activeId) ?? fallback
  const state = { isOpen, query, mode, armedId, list, sections, enabled, active }
  const setters = { setIsOpen, setQuery, setMode, setActiveId, setArmedId, setShowSessions }
  return { ...state, ...setters, close }
}

/**
 * Search-as-you-type branch picker: options, keyboard, and the busy-agents confirmation. A click
 * outside `wrapRef` closes it.
 */
export function useBranchPicker(
  checkout: GitCheckout,
  wrapRef: RefObject<HTMLElement | null>,
): BranchPickerState {
  const picker = usePickerOptions(checkout)
  const { close, enabled, active, mode } = picker
  const busyAgents = useBusyAgents(checkout)
  const runPick = useRunPick(checkout, close)
  useDismiss(wrapRef, picker.isOpen, close)

  const activate = (item: PickerItem) => {
    if (!isEnabled(item)) return
    if (busyAgents > 0 && changesFiles(item) && picker.armedId !== item.id) {
      picker.setArmedId(item.id)
    } else if (item.kind === 'sessions') {
      picker.setShowSessions(!item.isExpanded)
    } else if (item.kind === 'createFrom') {
      picker.setMode({ kind: 'base', newName: item.name })
      picker.setQuery('')
    } else {
      runPick(item, mode)
    }
  }
  const move = (step: number) => {
    if (enabled.length === 0) return
    const index = active ? enabled.indexOf(active) : -1
    const next = enabled[(index + step + enabled.length) % enabled.length]
    picker.setActiveId(next?.id ?? null)
    picker.setArmedId(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (active) activate(active)
    } else if (event.key === 'Escape') {
      // Handled here so the window-level dismiss does not also close from the base step.
      event.stopPropagation()
      if (mode.kind === 'base') picker.setMode(SWITCH_MODE)
      else close()
    }
  }
  return {
    isOpen: picker.isOpen,
    toggle: () => (picker.isOpen ? close() : picker.setIsOpen(true)),
    query: picker.query,
    setQuery: (query) => {
      picker.setQuery(query)
      picker.setActiveId(null)
      picker.setArmedId(null)
    },
    mode,
    list: picker.list,
    sections: picker.sections,
    active,
    armedId: picker.armedId,
    busyAgents,
    hover: picker.setActiveId,
    activate,
    onKeyDown,
  }
}
