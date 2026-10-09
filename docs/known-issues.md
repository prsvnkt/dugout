# Known issues

Limitations we have accepted for now and intend to revisit. Remove an entry when it is fixed.

## OpenCode agents do not get the project's .mcp.json servers

- **Area:** `src/main/services/agents/opencode/`
- **Found:** 2026-10-09, while adding the OpenCode adapter (decision 037)

**What happens:** OpenCode gets Dugout's "dugout" task server and status plugin, but not the
servers in the project's `.mcp.json`, which Claude Code loads itself and Codex gets as overrides.
A user's own `OPENCODE_CONFIG_CONTENT`, if they set one, is replaced by Dugout's in its terminals.

**Likely fix:** translate `.mcp.json` servers into OpenCode `local` / `remote` entries (`${VAR}`
becomes `{env:VAR}`), show them in Agent settings per agent, and merge an inherited
`OPENCODE_CONFIG_CONTENT` instead of replacing it.

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

**What happens:** the git status, expanded explorer folders, open files and what each worktree
changed (overlap warnings, decision 044) refresh every 3s while the app is visible (plus on focus
and agent status changes), so edits can take up to 3s to appear, and large expanded trees and
many worktrees are re-read on every tick.

**Likely fix:** a main-process watcher (`@parcel/watcher`) per active checkout that pushes
change events, keeping the poll only as a fallback.

## Overlap warnings compare whole files, between worktrees only

- **Area:** `src/renderer/src/features/overlaps/`
- **Found:** 2026-10-09, while adding overlap warnings (decision 044)

**What happens:** two worktrees that change different parts of one file are flagged, though git
may merge them cleanly. Agents in the main checkout are not tracked (their changes are not on a
branch of their own), and only the visible project is checked. If a listed worktree disappears
behind Dugout's back, the check fails and the warnings stay hidden until the list reloads.

**Possible improvement:** compare changed line ranges (`git diff -U0`), or ask git for a
trial merge (`git merge-tree`), and say "conflicts" only when the changes really meet.

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

## "Open in…" only finds editors in the Applications folders

- **Area:** open in editor (`src/main/services/openIn/OpenInService.ts`)
- **Found:** 2026-10-09, while building "Open in…" (decision 039)

**What happens:** an editor counts as installed only when its bundle sits in `/Applications` or
`~/Applications` under its usual name (`Visual Studio Code.app`, `Cursor.app`, `Zed.app`). Apps
kept elsewhere, renamed, or other builds (VS Code Insiders, Zed Preview) are not offered.

**Likely fix:** look apps up by bundle id through Launch Services (e.g. a small `mdfind`
fallback or `NSWorkspace` via a native helper), and add the Insiders/Preview builds.

## Review comments cannot target removed lines and do not follow edits

- **Area:** review comments (`src/renderer/src/features/reviewComments/`)
- **Found:** 2026-10-09, while building decision 041

**What happens:** comments go on the new side of a Review diff only, so a removed line can be
discussed only through a nearby line. A comment keeps the line numbers it was made on; if the
file changes before it is sent, `path:line` may point a little off (the quoted code still says
what was meant). Comments are lost when the app reloads.

**Likely fix:** allow comments on the left side as `path (removed):line`, and move comments with
Monaco decoration ranges when the model changes.

## Dev server shells are not restored on relaunch

- **Area:** preview (`src/renderer/src/features/preview/`, `workspace/useWorkspacePersistence.ts`)
- **Found:** 2026-10-09, while building dev servers per worktree (decision 049)

**What happens:** a shell started with "Run" is saved like any shell, without its dev command or
port, so after a relaunch it comes back as a plain shell and the Preview block offers "Run"
again.

**Likely fix:** save `devServer` with the pane and rerun it on restore (asking for a fresh port).

## PR feedback for agents is capped and Actions-only for logs

- **Area:** `src/main/services/github/GitHubPullFeedback.ts` (decision 045)
- **Found:** 2026-10-09, while building "Address review comments" / "Fix failing CI"

**What happens:** only the first 100 review threads (20 comments each) are read, with no
pagination, and only GitHub Actions checks get a log tail; other CI providers (and commit
statuses) contribute just their title and link. Details are fetched for the first 5 failing runs.

**Likely fix:** paginate `reviewThreads` when a PR exceeds 100 threads, and read logs from other
providers' `details_url` if a common format turns up.

## Verify on Stop runs every check at once and keeps no history

- **Area:** `src/main/services/checks/`, `src/renderer/src/features/checks/`
- **Found:** 2026-10-09, while building Verify on Stop (decision 042)

**What happens:** each agent's check starts as soon as it finishes, so several agents stopping
together run several heavy checks in parallel. A result lives only as long as the agent's
terminal (gone after a relaunch). A check in a new worktree fails when it needs untracked setup
such as `node_modules/` (see "Worktrees start without untracked setup files"). An agent whose
"Done" was already seen does not come back to the inbox when its check fails later; its header
still shows it.

**Likely fix:** a small concurrency limit with a "Queued" state; run the worktree setup command
before the first check; keep a failed check in the inbox until it is opened.
