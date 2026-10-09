# Known issues

Limitations we have accepted for now and intend to revisit. Remove an entry when it is fixed.

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
start straight away. If a Dugout update changes or adds hook commands (as the subagent hooks of
decision 032 did), Codex asks again.

**Possible improvement:** detect a Codex pane stuck in "Starting" and show a hint about the
review prompt.

## Subagents show only their type, in one flat list

- **Area:** Agents list (`src/renderer/src/features/agents/`, `HookServer.parseSubagent`)
- **Found:** 2026-10-08, while adding subagents (decision 032)

**What happens:** a subagent line says only "Explore" or "code-reviewer" until it finishes,
because `SubagentStart` carries no task description. Codex subagents that start their own
subagents appear on the same level as their parent. Codex may only start subagents with its
multi-agent feature enabled (`features.multi_agent_v2`), which is the user's setting. If Dugout
restarts while subagents run, they are not shown again.

**Possible improvement:** take the description from the `Agent`/`Task` tool's `PreToolUse`
input (Claude) and match it to the subagent; nest Codex subagents by their task path.

## Untracked files over the counting limits show no diff stats

- **Area:** `src/main/services/git/untrackedLineStats.ts`
- **Found:** 2026-10-07, while adding diff stats to Review

**What happens:** git has no line counts for untracked files, so Dugout reads them itself on
every status poll. To keep that cheap it counts only the first 200 untracked files and skips
files over 1 MB and symlinks; those rows show no `+N` or bar.

**Likely fix:** cache counts by path, size and mtime, and lift the limits; or count in the
file watcher once polling is replaced (see "Change detection polls instead of watching files").

## Packaged app is unsigned and Apple Silicon only

- **Area:** packaging (`electron-builder.yml`)
- **Found:** 2026-10-07, while adding `npm run dist`

**What happens:** the app is ad-hoc signed without hardened runtime or notarization, and built
for arm64 only. Copies downloaded from the internet are quarantined, so macOS asks users to
click Open Anyway in System Settings → Privacy & Security (or run
`xattr -dr com.apple.quarantine`). Intel Macs are not supported, and
there are no automatic updates.

**Why:** notarization needs an Apple Developer ID; not worth it while Dugout is used locally.

**Likely fix:** with a Developer ID, enable `hardenedRuntime` with entitlements (node-pty and
the Node-mode MCP server need `cs.allow-jit` / `cs.disable-library-validation`), add
`notarize`, add an `x64` or `universal` target, and use `electron-updater` with GitHub Releases.

## The welcome screen offers to clone repos that are already on this Mac

- **Area:** welcome screen (`src/renderer/src/features/welcome/GitHubSection.tsx`)
- **Found:** 2026-10-07, while building the welcome screen (decision 027)

**What happens:** a GitHub repo that is already cloned locally shows under both "On this Mac"
and "GitHub". Clicking Clone fails with "not empty" when the folder already exists in the clone
folder, and makes a second copy when it does not.

**Likely fix:** read each local repo's `origin` URL in the search and hide GitHub rows (or
offer "Add") for repos that match.
