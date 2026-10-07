# Decisions

Short records of decisions that shape the codebase. Add a new entry rather than editing an old one.

## 001 — Real Claude Code in a terminal, no Agent SDK (2026-10-05)

Sessions run the `claude` CLI in a PTY rendered by xterm.js. This keeps the exact terminal
experience (config, auth, slash commands, subscription billing) and avoids building a chat UI.
Structured status comes from Claude Code **hooks**, injected per session with
`claude --settings <generated file>`, which post events to the app. The user's `~/.claude` is
never modified.

## 002 — One project = one repo (2026-10-05)

Multi-folder projects complicate cwd, diffs and worktrees for little gain. `--add-dir` covers
the rare exception.

## 003 — Git integration for review, not a git client (2026-10-05)

In scope: branch and ahead/behind, changed files (including untracked), diff, stage / unstage /
discard, commit, push, worktree per session, create PR via `gh`. Out of scope: conflict
resolution, rebase, history graph, blame.

## 004 — Terminals do not outlive the app, for now (2026-10-05)

PTYs are owned by the app and killed on quit or renderer reload. Restoring Claude conversations
will use `claude --resume <session_id>` (id from the `SessionStart` hook). All spawning goes
through `TerminalBackend`, so a tmux-backed backend can be added if agents need to survive
restarts.

## 005 — Toolchain (2026-10-05)

electron-vite 5 (Vite 7), React 19, TypeScript 5.9 strict, zod 4 at IPC boundaries, Vitest,
Playwright for Electron E2E, ESLint flat config + Prettier. SQLite, Monaco and file watchers are
deferred until a feature needs them: start with JSON for metadata, git status driven by hook
events for change detection, and a lightweight diff viewer.

## 006 — Shortcuts live in the native menu (2026-10-05)

All keyboard shortcuts are menu accelerators that send an `AppCommand` to the renderer. They work
while a terminal has focus, appear in the menu bar, and let ⌘W close a pane instead of the window.

## 007 — Side-by-side panes only, terminals stay mounted (2026-10-05)

Each project shows up to 6 resizable side-by-side panes. Every project's workspace stays mounted
while hidden so terminals keep running across project switches. Grid splits and saving layouts
between launches are deferred.

## 008 — Agent status from hooks over a private socket (2026-10-05)

Claude terminals start as `claude --settings <userData>/claude-hooks.json`. Its async command
hooks `curl` a signal (`ready`, `working`, `needs-input`, `done`) to an HTTP server on a Unix
socket (mode 0600) with a per-launch bearer token; the terminal id, socket, token and settings
path reach the shell as `DUGOUT_*` env vars. Hooks are no-ops outside Dugout, time out after 2s
and always succeed, so they can never disturb Claude. "Done" clears once the user views the pane.
The dock badge counts panes that need the user. If the hook server fails to start, terminals
still work without status. `DUGOUT_CLAUDE_COMMAND` overrides the `claude` binary (used by e2e
tests with a fake CLI that runs the generated hooks).

## 009 — Git panel runs the git CLI directly (2026-10-05)

`GitService` spawns `git` with `GIT_OPTIONAL_LOCKS=0` (refreshing never takes the index lock an
agent may need), `GIT_LITERAL_PATHSPECS=1` (paths are never globs), `GIT_TERMINAL_PROMPT=0` and
BatchMode SSH (it can never hang on a credential prompt), and output caps for large diffs. The
renderer addresses repositories by project id only; main resolves the path. Status refreshes on
show, every 3s while visible, on window focus and whenever an agent in the project changes
status. Diffs use a small custom unified-diff view instead of Monaco. Discard needs two clicks.

## 010 — Notifications only while Dugout is in the background (2026-10-05)

`AgentNotifier` shows a native notification for `needs-input` and `done` only when no Dugout
window is focused; inside the app the panes, sidebar and dock badge already say it. Clicking a
notification sends `terminal.reveal`, which selects the project and focuses the pane.

## 011 — Create PR opens the browser instead of using gh (2026-10-05)

"Create PR" pushes (or publishes) when needed, then opens the GitHub compare page or GitLab
new-merge-request page built from the `origin` URL. No CLI or login needed. The base branch
comes from `origin/HEAD`, defaulting to `main`. Only github.com/gitlab.com URLs are opened.

## 012 — Worktree sessions live in app data on dugout/* branches (2026-10-05)

`WorktreeManager` creates worktrees at `<userData>/worktrees/<projectId>/<id>` on branch
`dugout/<id>`, and only ever lists, targets or removes worktrees under that folder. Git requests
may target a worktree; main validates it belongs to the project. The git panel follows the
focused pane's checkout. Removal uses `git worktree remove` without `--force`, so uncommitted
work is never lost; the branch is kept for merging or a PR.

## 013 — Layouts persist; Claude panes resume their conversation (2026-10-05)

Panes (kind, worktree, Claude session id) are saved to `<userData>/workspace.json` (debounced)
and restored on launch. The `SessionStart` hook forwards its payload so main learns the session
id; it is reported only once the session has had a prompt, because Claude cannot resume an empty
session. Restored panes run `claude --resume <id>`. Launch lines use only plain `"$VAR"`
expansions, since conditional forms behave differently in bash, zsh and fish. A pane that exits
before Claude was ready (failed resume) offers "Start new session" instead of resuming again.

## 014 — Explorer and Monaco editor in the center (2026-10-05)

Layout per project: Explorer (left, ⌘B) | editor tabs above terminals (center) | git panel
(right). Panels keep fixed slots so opening files never remounts terminals. Files open in
Monaco (lazy-loaded chunk, local workers, no CDN); one model per file is shared by its file tab
and the editable side of its diff tab. Unsaved state uses Monaco's alternative version id.
Diffs open in the center: unstaged = index vs working file (editable), staged = HEAD vs index.
`FileService` resolves every path with realpath and refuses anything outside the checkout;
saves are atomic, keep the file mode, and are refused if the file changed on disk since it
was opened. Open files reload when changed on disk; unsaved edits get a "Reload / Keep mine"
banner. ⌘W closes the editor tab when the editor had focus, otherwise the pane.

## 015 — GitHub sign-in via device flow; token stays in main (2026-10-05)

Signing in uses GitHub's OAuth device flow (show a code, approve in the browser) with scopes
`repo read:user workflow`. It needs a Dugout OAuth App with Device Flow enabled; its public
client ID (`Ov23libOb8Uedg6F3xsu`, owned by the maintainer's account for now; transfer the app to
an organization later to keep the same ID) lives in `services/github/config.ts`
(`DUGOUT_GITHUB_CLIENT_ID` overrides it). The app has "Expire user access tokens" on: access
tokens last ~8h and are renewed with the (rotating, ~6-month) refresh token, which for device-flow
tokens needs no client secret. `GitHubAuth.freshToken()` renews when a token expires within 5
minutes (one shared request for concurrent callers); `withToken()` renews and retries once on a 401. A rejected or expired refresh token signs the user out with a clear message. Credentials are
stored as JSON; plain tokens from earlier versions are still read (as non-expiring).
Being unable to reach GitHub (network failure or 5xx) never signs anyone out: the session stays,
the state becomes `offline` (showing the account saved with the session), and Dugout retries
after 15s, 30s, 1m, 2m, then every 5m, immediately when the system reports it is back online,
and whenever a GitHub call succeeds. The token is
encrypted with Electron `safeStorage` (Keychain) in `<userData>/github-token.bin` (0600) and
never sent to the renderer, which only sees `{ login, name, avatarUrl }`. Network git commands
(push, clone) get the token through a credential helper scoped to the GitHub host that reads it
from an env var, after clearing other helpers for that host; SSH remotes and agents' own git
commands are unaffected. E2E tests use a local stub server (`DUGOUT_GITHUB_BASE_URL`) and an
explicit insecure token store (`DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS=1`) to avoid Keychain
prompts.

## 016 — Clone from your GitHub repos or any URL (2026-10-05)

"Clone repository…" (sidebar, welcome screen, ⇧⌘C) offers a searchable list of the signed-in
user's GitHub repositories or a URL (https, ssh, scp-style, file:// or an absolute path; never
anything starting with "-", and passed after `--`). It clones with `git clone --progress` into
`<parent>/<folder>`, streaming progress and supporting cancel; the destination must not exist or
be empty, and a folder the clone created is removed on failure or cancel. The parent folder is
remembered in `<userData>/settings.json` (default `~/Developer`, else home). On success the
repo is added as a project with the next free colour.

## 017 — Projects as title-bar tabs; collapsible side panels (2026-10-05)

Projects are Chrome-style tabs in the title bar (colour dot, name, most urgent agent status,
⋯ to edit, + for Add project / Clone repository), with the GitHub account at the right. The
left sidebar is gone: the Explorer is the leftmost panel. Explorer and Git panel collapse to
28px rails (header button, ⌘B / ⇧⌘G, or dragging them closed) and stay mounted in fixed
slots, so collapsing never remounts terminals. New-pane buttons live in a Terminals header.

## 018 — Tasks are GitHub Issues; agents work on them via an MCP server (2026-10-06)

A project's tasks are the GitHub Issues of its `origin` repo (Tasks tab beside Git). Status:
closed = Done; open + `dugout:in-review` / `dugout:in-progress` labels (created on first use) =
In review / In progress; otherwise To do. "Start agent" creates a worktree `dugout/<n>-<slug>`,
marks the issue In progress and starts Claude with the issue as its first prompt; panes remember
their task (`#n` in the header, live agent status on the task). Create PR from such a branch
pre-fills "Closes #n" and marks the task In review, so merging closes it.
Every Claude pane gets a per-terminal `--mcp-config` (0600, deleted on exit) for the bundled
"dugout" MCP server (`out/main/mcp.js`, run by Electron in Node mode, official MCP SDK) with
tools list/get/create/update/comment. The server forwards calls over the private hook socket
(`/rpc/<terminalId>`), where main validates them, scopes them to the terminal's project and calls
GitHub with the user's token — the agent never sees it. The hook settings pre-approve
`mcp__dugout`. The first prompt is placed before `--mcp-config`, which takes a list. Providers
are behind `TaskService`, so Jira or local storage can be added later.

## 019 — "Needs you" inbox across projects (2026-10-06)

Hooks for ready, needs-input and done forward their payload, and the hook server extracts a
short detail (≤140 chars): "Tool: command/file" for permission requests, the notification
message, or the first line of the agent's last message on Stop. The detail travels with the
status (also used as the notification body); the renderer keeps `{ detail, since }` per pane.
The title-bar Inbox (⇧⌘I) lists every agent pane in any project that needs you (first) or has
an unseen Done, newest first; clicking one selects the project and focuses the pane. The list is
derived (pure `inboxEntries`), not stored.

## 020 — Pull request and CI status in the git panel (2026-10-06)

For a checkout on a GitHub remote, `GitHubPulls.forBranch` finds the branch's PR
(`/pulls?head=owner:branch&state=all`), its review decision (each reviewer's latest APPROVED or
CHANGES_REQUESTED; any change request wins) and CI (check runs + commit statuses on the PR head:
failing > pending > passing; skipped runs not counted). The git panel shows a "Pull request" block
with expandable checks and swaps Create PR for Open PR. It refreshes every 60s while shown, on
focus, and when the branch's push state changes. Links open only on the GitHub host
(`git:open-url`). The GitHub REST helpers (`githubRequest`/`githubJson`) are shared with Issues.

## 021 — Codex panes, and Claude + Codex on one task (2026-10-06)

`codex` is a terminal kind next to `claude`; `isAgentKind` covers both for status, resume, the
inbox, notifications and task tools. Codex gets the same status hooks (its events match Claude
Code's; it has no Notification event) and the "dugout" MCP server as `-c key=value` overrides,
each passed in its own `$DUGOUT_CODEX_C<n>` variable so the shell line stays plain `"$VAR"`s.
Codex collects hooks per config layer (user, project, plugin, session flags…), so the overrides
add to the user's hooks rather than replace them; nothing is merged or rewritten. Codex asks to
review new hooks once; the commands read the terminal from the environment, so they never change
and one "Trust" covers every pane. Dugout never passes `--dangerously-bypass-hook-trust`.

On a task, "Start agent ▾" offers Claude, Codex, or both; both get their own worktree
(`dugout/<n>-<slug>-claude` / `-codex`). The Compare tab lists what each worktree changed since it
left the base branch (`GitService.changesSince`: merge-base diff plus untracked files), marks
files as one agent's or both, and diffs the two versions read-only. You pick a winner with the
usual Create PR; nothing is merged automatically.

## 022 — Agent settings: .mcp.json servers and AGENTS.md as the shared instructions (2026-10-06)

An "Agent settings" tab (View → Agent Settings, ⇧⌘,) edits the project's `.mcp.json` at the main
checkout. Only the fields Dugout shows are checked and rewritten; unknown fields on the file and on
each server are kept, writes are atomic, and a save is refused if the file changed since it was
read. Values that look like secrets written out in full get a warning (the file is usually
committed; use `${VAR}`). Claude Code keeps loading `.mcp.json` itself. Codex panes get the same
servers as `-c mcp_servers.<name>=…`, read from the pane's checkout when it starts. Codex does not
expand `${VAR}`, so a `${KEY}` env entry becomes `env_vars`, `Authorization: Bearer ${VAR}` becomes
`bearer_token_env_var`, and a whole-value `${VAR}` header becomes `env_http_headers`; servers that
need anything else (SSE, `${VAR}` inside a command, URL or longer value) stay Claude-only, and the
tab says why. Values are never expanded into Codex's arguments, so no secret reaches a process
list. There is no per-project "share with Codex" switch; sharing what Codex can run is the point
(add one if a project needs it).

"Make AGENTS.md the source" moves CLAUDE.md into a new AGENTS.md (or keeps an existing one) and
leaves CLAUDE.md as an `@AGENTS.md` import (`@../AGENTS.md` from `.claude/CLAUDE.md`) plus a
Claude-only section, so both agents follow one set of instructions.

## 023 — "Day game": a light theme with project rooms and an activity rail (2026-10-06)

Dugout switches from its dark theme to one light theme (no dark option; it could return as a
token override). Cool neutrals, Schibsted Grotesk for UI and JetBrains Mono for code, both
bundled as variable fonts (CSP allows only `font-src 'self'`). The selected project's colour is
the UI `--accent`, set on the app root: it washes the title bar and the rail (the project's
"room"), underlines the focused pane, fills the status bar and drives focus rings. Project colours
are deep variants with white text at least 4.5:1 on each.

A 48px activity rail replaces the collapsed side-panel rails. It toggles Files (⌘B), Review
(⇧⌘G, with the change count) and Tasks, and its "+" menu holds the new-pane actions and Agent
settings that used to sit in the "Terminals" header (now gone). The right panel shows Review or
Tasks, picked in the rail, instead of tabs. Pane headers carry a pane number (01, 02…). The git
panel is "Review": a segmented checkout picker (a select beyond three checkouts) and the commit
box pinned to the bottom. xterm and Monaco use matching light themes; set Claude Code itself to a
light theme with `/theme` so its TUI colours read on the light background.

Review rows show per-side `+N −M` and a small green/red bar (log-scaled, so a tweak and a
rewrite look different), from `git diff --numstat` and `--cached --numstat` run alongside
`git status`; untracked files count as all added lines (limits in known-issues). A
prompt dock that types into the focused pane was considered and dropped: the terminal is the input.

## Roadmap

1. **Now:** one terminal running Claude Code or a shell in a chosen folder. ✅
2. **MVP:**
   - Projects (repo, name, colour) in a sidebar; split-pane terminals per project. ✅
   - Status from hooks (ready / working / needs you / done / exited). ✅
   - Git panel (branch, changes, diff, stage / commit / push). ✅
3. **Next:** worktree sessions ✅, resume on relaunch ✅, native notifications ✅, create PR ✅.
4. **Done since:** explorer + center editor ✅, GitHub sign-in ✅, clone ✅.
5. **Done since:** tasks from GitHub Issues ✅, "needs you" inbox ✅, PR/CI status ✅,
   Codex adapter with Compare ✅.
6. **Done since:** agent settings (`.mcp.json` editor, AGENTS.md as shared instructions) ✅.
7. **Done since:** "Day game" light theme with activity rail ✅, Review diff stats ✅.
