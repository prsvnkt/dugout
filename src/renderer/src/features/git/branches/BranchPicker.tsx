import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { GitCheckout } from '@shared/worktree'
import { useExplorerStore } from '@renderer/features/explorer/explorerStore'
import { useWorktreeStore } from '@renderer/features/worktrees/worktreeStore'
import { useDismiss } from '@renderer/lib/useDismiss'
import { useGitStore } from '../gitStore'
import { pickerSections, type PickerItem, type PickerMode } from './pickerSections'
import { BranchPickerRow } from './BranchPickerRow'
import { useBranches } from './useBranches'
import { useBusyAgents } from './useBusyAgents'
import styles from './BranchPicker.module.css'

const SWITCH_MODE: PickerMode = { kind: 'switch' }

interface BranchPickerProps {
  readonly checkout: GitCheckout
  readonly currentBranch: string | null
  /** The trigger's content, e.g. "⎇ main ↑1". */
  readonly children: ReactNode
}

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

/** Search-as-you-type branch switcher anchored to the branch in the Source Control panel. */
export function BranchPicker({ checkout, currentBranch, children }: BranchPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<PickerMode>(SWITCH_MODE)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [showSessions, setShowSessions] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const list = useBranches(checkout, isOpen)
  const busyAgents = useBusyAgents(checkout)
  const { switchBranch, createBranch } = useGitStore()
  const startWorktreeSession = useWorktreeStore((state) => state.startSession)
  const refreshExplorer = useExplorerStore((state) => state.refresh)

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setMode(SWITCH_MODE)
    setArmedId(null)
    setShowSessions(false)
  }, [])
  useDismiss(wrapRef, isOpen, close)

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

  const finish = async (action: Promise<boolean>) => {
    close()
    if (await action) void refreshExplorer(checkout)
  }

  const activate = (item: PickerItem) => {
    if (!isEnabled(item)) return
    if (busyAgents > 0 && changesFiles(item) && armedId !== item.id) {
      setArmedId(item.id)
      return
    }
    if (item.kind === 'sessions') {
      setShowSessions(!item.isExpanded)
      return
    }
    if (item.kind === 'createFrom') {
      setMode({ kind: 'base', newName: item.name })
      setQuery('')
      return
    }
    if (item.kind === 'worktree') {
      close()
      void startWorktreeSession(checkout.projectId)
      return
    }
    if (item.kind === 'create') return void finish(createBranch(checkout, item.name))
    if (mode.kind === 'base')
      return void finish(createBranch(checkout, mode.newName, item.branch.name))
    void finish(switchBranch(checkout, { kind: item.branch.kind, name: item.branch.name }))
  }

  const move = (step: number) => {
    if (enabled.length === 0) return
    const index = active ? enabled.indexOf(active) : -1
    const next = enabled[(index + step + enabled.length) % enabled.length]
    setActiveId(next?.id ?? null)
    setArmedId(null)
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
      if (mode.kind === 'base') setMode(SWITCH_MODE)
      else close()
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.trigger}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Switch branch (current: ${currentBranch ?? 'detached HEAD'})`}
        title="Switch or create a branch"
      >
        {children}
        <span className={styles.caret} aria-hidden>
          ⌄
        </span>
      </button>
      {isOpen && (
        <div className={styles.popover} role="dialog" aria-label="Switch branch">
          {mode.kind === 'base' && (
            <p className={styles.step}>
              Create “{mode.newName}” from… <kbd>esc</kbd> back
            </p>
          )}
          <input
            className={styles.search}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveId(null)
              setArmedId(null)
            }}
            onKeyDown={onKeyDown}
            placeholder={
              mode.kind === 'base'
                ? 'Choose a starting branch'
                : 'Switch branch, or type a new name'
            }
            aria-label={mode.kind === 'base' ? 'Starting branch' : 'Branch name'}
            role="combobox"
            aria-expanded
            aria-controls="branch-options"
            aria-activedescendant={active ? `branch-option-${active.id}` : undefined}
            autoFocus
            spellCheck={false}
          />
          {busyAgents > 0 && mode.kind === 'switch' && (
            <p className={styles.warning} role="note">
              {busyAgents === 1 ? '1 agent is' : `${busyAgents} agents are`} busy in this checkout.
              Switching changes their files mid-task; a worktree session keeps them safe.
            </p>
          )}
          {list.state === 'loading' && <p className={styles.notice}>Loading branches…</p>}
          {list.state === 'error' && <p className={styles.error}>{list.message}</p>}
          <ul className={styles.list} id="branch-options" role="listbox" aria-label="Branches">
            {sections.map((section, index) => (
              <li key={section.title ?? `actions-${index}`} role="presentation">
                {section.title && (
                  <span className={styles.sectionTitle} role="presentation">
                    {section.title}
                  </span>
                )}
                <ul role="group" aria-label={section.title ?? 'Actions'} className={styles.group}>
                  {section.items.map((item) => (
                    <BranchPickerRow
                      key={item.id}
                      item={item}
                      isActive={item.id === active?.id}
                      isArmed={item.id === armedId}
                      onActivate={() => activate(item)}
                      onHover={() => setActiveId(item.id)}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
