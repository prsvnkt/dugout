import { useRef, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GitCheckout } from '@shared/worktree'
import { Icon } from '@renderer/lib/Icon'
import { BranchPickerRow } from './BranchPickerRow'
import { useBranchPicker, type BranchPickerState } from './useBranchPicker'
import styles from './BranchPicker.module.css'

interface BranchPickerProps {
  readonly checkout: GitCheckout
  readonly currentBranch: string | null
  /** The trigger's content, e.g. "⎇ main ↑1". */
  readonly children: ReactNode
}

/** The options, grouped into titled sections (actions first). */
function PickerOptions({ picker }: { picker: BranchPickerState }) {
  return (
    <ul className={styles.list} id="branch-options" role="listbox" aria-label="Branches">
      {picker.sections.map((section, index) => (
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
                isActive={item.id === picker.active?.id}
                isArmed={item.id === picker.armedId}
                onActivate={() => picker.activate(item)}
                onHover={() => picker.hover(item.id)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function PickerPopover({ picker }: { picker: BranchPickerState }) {
  const { mode, list, active, busyAgents } = picker
  const isBase = mode.kind === 'base'
  return (
    <div className={styles.popover} role="dialog" aria-label="Switch branch">
      {mode.kind === 'base' && (
        <p className={styles.step}>
          Create “{mode.newName}” from… <kbd>esc</kbd> back
        </p>
      )}
      <input
        className={styles.search}
        value={picker.query}
        onChange={(event) => picker.setQuery(event.target.value)}
        onKeyDown={picker.onKeyDown}
        placeholder={isBase ? 'Choose a starting branch' : 'Search or create a new branch'}
        aria-label={isBase ? 'Starting branch' : 'Branch name'}
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
      <PickerOptions picker={picker} />
    </div>
  )
}

/** Search-as-you-type branch switcher anchored to the branch in the Source Control panel. */
export function BranchPicker({ checkout, currentBranch, children }: BranchPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const picker = useBranchPicker(checkout, wrapRef)
  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        className={styles.trigger}
        onClick={picker.toggle}
        aria-haspopup="dialog"
        aria-expanded={picker.isOpen}
        aria-label={`Switch branch (current: ${currentBranch ?? 'detached HEAD'})`}
        title="Switch or create a branch"
      >
        {children}
        <Icon icon={ChevronDown} className={styles.caret} />
      </button>
      {picker.isOpen && <PickerPopover picker={picker} />}
    </div>
  )
}
