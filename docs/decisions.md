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

## Roadmap

1. **Now:** one terminal running Claude Code or a shell in a chosen folder. ✅
2. **MVP:**
   - Projects (repo, name, colour) in a sidebar; split-pane terminals per project. ✅
   - Status from hooks (ready / working / needs you / done / exited). ✅
   - Git panel (branch, changes, diff, stage / commit / push). ✅
3. **Next:** worktree sessions ✅, resume on relaunch ✅, native notifications ✅, create PR ✅.
4. **Later:** "needs you" inbox across projects, Codex adapter, PR/CI status in the git panel,
   per-project MCP config editor.
