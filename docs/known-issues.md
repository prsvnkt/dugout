# Known issues

Limitations we have accepted for now and intend to revisit. Remove an entry when it is fixed.

## Parallel tool calls can briefly hide "Needs you"

- **Area:** agent status (`src/main/services/agentHooks/hookSettings.ts`, `TerminalManager.applyHookSignal`)
- **Found:** 2026-10-05, while building agent status (decision 008)

**What happens:** within one Claude turn, if several tools run in parallel and only some need
approval, a `PostToolUse` from a tool that finished sends `working` and overwrites
`needs-input`, even though another tool is still waiting for approval. The pane, sidebar and
dock badge then stop showing "Needs you" until the next permission prompt.

**Why:** signals carry no tool identity. The status is simply the last signal received.

**Likely fix:** send the hook payload (stdin) with `PermissionRequest` and `PostToolUse`, and
track pending approvals by `tool_use_id` per terminal. Stay `needs-input` while any approval
is pending; `Stop` clears all of them. Add unit tests for the interleavings, and extend the
fake `claude` in `tests/e2e/helpers.ts` to emit tool ids.

## Worktrees start without untracked setup files

- **Area:** worktree sessions (`src/main/services/worktrees/WorktreeManager.ts`)
- **Found:** 2026-10-05, while building worktree sessions (decision 012)

**What happens:** a new worktree is a clean checkout of HEAD, so untracked files such as
`.env`, `node_modules/` or build output are missing. An agent may need to install dependencies
or recreate local config before running the app or tests.

**Likely fix:** an opt-in per-project list of files to copy (e.g. `.env*`) and an optional
setup command run in the new worktree (e.g. `npm install`), shown in the pane while it runs.

## E2E tests can time out when the machine is busy

- **Area:** `tests/e2e/` (Playwright, one Electron instance per worker)
- **Found:** 2026-10-05; still seen occasionally while other Dugout dev instances were running.

**Mitigated:** `playwright.config.ts` now caps workers at 4, allows 60s per test, and retries
once on CI. Shell-based tests wait for the user's login shell, so a slow shell profile under load
can still stretch them.

**Seen again 2026-10-07:** twice, as `electronApplication.firstWindow` timing out (the window
never opened) in otherwise unrelated specs, plus "errors not part of any test" from their
teardown; an immediate rerun passed. This is app launch, not shells, so the profile fix below
would not cover it; consider retrying once locally too.

**If it recurs:** start test shells with a minimal profile (e.g. `ZDOTDIR` pointing at an empty
folder) so tests do not depend on the developer's shell setup.

## Change detection polls instead of watching files

- **Area:** `src/renderer/src/features/workspace/useCheckoutRefresh.ts`
- **Found:** 2026-10-05, while building the explorer and editor (decision 014)

**What happens:** the git status, expanded explorer folders and open files refresh every 3s
while the app is visible (plus on focus and agent status changes), so edits can take up to 3s
to appear, and large expanded trees are re-read on every tick.

**Likely fix:** a main-process watcher (`@parcel/watcher`) per active checkout that pushes
change events, keeping the poll only as a fallback.

## Codex asks to trust Dugout's hooks once

- **Area:** `src/main/services/agentHooks/codexConfig.ts`
- **Found:** 2026-10-06, verified with codex-cli 0.155

**What happens:** the first Codex pane shows "Hooks need review". Until you choose _Trust all and
continue_ (or review them with `/hooks`), Codex runs without them and the pane never leaves
"Starting". Codex stores the trust in `~/.codex/config.toml` (`[hooks.state]`), so later panes
start straight away. If a Dugout update changes the hook commands, Codex asks again.

**Possible improvement:** detect a Codex pane stuck in "Starting" and show a hint about the
review prompt.

## Untracked files over the counting limits show no diff stats

- **Area:** `src/main/services/git/untrackedLineStats.ts`
- **Found:** 2026-10-07, while adding diff stats to Review

**What happens:** git has no line counts for untracked files, so Dugout reads them itself on
every status poll. To keep that cheap it counts only the first 200 untracked files and skips
files over 1 MB and symlinks; those rows show no `+N` or bar.

**Likely fix:** cache counts by path, size and mtime, and lift the limits; or count in the
file watcher once polling is replaced (see "Change detection polls instead of watching files").
