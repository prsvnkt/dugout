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
hooks `curl` a signal (`ready`, `working`, `tool-done`, `needs-input`, `done`; see decision 036
for how pending approvals keep `needs-input`) to an HTTP server on a Unix
socket (mode 0600) with a bearer token per terminal (decision 059); the terminal id, socket, token and settings
path reach the shell as `DUGOUT_*` env vars. Hooks are no-ops outside Dugout, time out after 2s
and always succeed, so they can never disturb Claude. "Done" clears once the user views the pane.
The dock badge counts panes that need the user. If the hook server fails to start, terminals
still work without status. Subagents use the same socket (decision 032). `DUGOUT_CLAUDE_COMMAND`
overrides the `claude` binary (used by e2e tests with a fake CLI that runs the generated hooks).

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
repo is added as a project (named after its folder, in a random free colour).

## 017 — Projects as title-bar tabs; collapsible side panels (2026-10-05)

Projects are Chrome-style tabs in the title bar (colour dot, name, most urgent agent status,
× to close, + for Add project / Clone repository; see decision 029), with the GitHub account at
the right. The
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
tools list/get/create/update/comment (plus batch create, search, priority, labels and related
tasks since decision 034). The server forwards calls over the private hook socket
(`/rpc/<terminalId>`), where main validates them (`taskRpc.ts`), scopes them to the
terminal's project and calls GitHub with the user's token — the agent never sees it. The hook settings pre-approve
`mcp__dugout`. The first prompt is placed before `--mcp-config`, which takes a list. Providers
are behind `TaskService`, so Jira or local storage can be added later.

_Superseded in part by 053: the hook settings no longer pre-approve the whole `mcp__dugout`
server, only its read and propose tools; task writes ask first._

## 019 — "Needs you" inbox across projects (2026-10-06)

Hooks for ready, needs-input and done forward their payload, and the hook server extracts a
short detail (≤140 chars): "Tool: command/file" for permission requests, the notification
message, or the first line of the agent's last message on Stop. The detail travels with the
status (also used as the notification body); the renderer keeps `{ detail, approvals, since }`
per pane. The title-bar Inbox (⇧⌘I) lists every agent pane in any project that needs you (first)
or has an unseen Done, newest first; clicking one selects the project and focuses the pane. The
list is derived (pure `inboxEntries`), not stored. Since decision 036, an entry that waits for
approval shows the whole tool call instead of the short detail, and Return on an entry puts the
keyboard in that agent's terminal.

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
"room"), underlines the focused pane, fills the status bar and drives focus rings. With no
project open the accent is field green (decision 028). Project colours are deep variants with
white text at least 4.5:1 on each.

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

## 024 — Branch picker, with agents in mind (2026-10-07)

Clicking the branch in Source Control opens a searchable branch picker (keyboard first: type,
↑↓, Enter, Esc). It lists local branches newest first, then remote branches that have no local
copy (picking one creates a tracking branch), each with its age and last commit. Enter picks the
best match; with an empty search that is the most recent other branch, like `git switch -`. A
name no branch has can be created at HEAD, or "from…" another branch.

Unlike an editor, Dugout has agents running in the checkout, and switching branches changes
their files mid-task. So when an agent in that checkout is starting, working or waiting for
you, the picker says so, offers a worktree session instead, and asks for a second Enter/click
before anything that changes files. Branches checked out in another worktree are shown but
cannot be picked (git refuses). Detached checkouts and tags are left out; fetching is decision 030.
Worktree sessions' own `dugout/*` branches are grouped last under a collapsed "Agent sessions"
row (searching shows matches), and removing a session now deletes its branch with `git branch -d`
when it has no work the main checkout lacks, so finished sessions stop piling up as branches.
Every command goes through `GitService` (decision 009), which only switches to branches that
exist and validates new names with `git check-ref-format`.

## 025 — The logo: "Window" on the field (2026-10-07)

The mark is an app window whose title bar is also a dugout roof, with a bench of coloured session
dots inside, on field green (`#0f3d2e`). It shows what Dugout is, an app holding your agents,
without leaning on baseball clip art. The amber dot doubles as the "needs you" status.
`resources/logo.svg` is the one source for the mark; `icon.svg` puts it on the macOS icon grid
and `icon-small.svg` simplifies it to two dots for 32 px and below. `npm run icons` renders
`icon.png` and `icon.icns` with Electron itself, so no extra image tools are needed. At runtime
`applyAppIcon` sets the Dock and About panel icon, since unpackaged Electron shows its own.
`icon.icns` is ready for packaging but unused until we package the app.

## 026 — A start screen, and "agents" instead of "panes" (2026-10-07)

**Context.** A project with nothing open showed "No terminals yet" and two buttons. Dugout also
runs more than one agent CLI now (Claude, Codex, more later), and users saw the layout word
"pane" for what they think of as an agent.

**Decision.** A project with no agents open shows a start screen:

- A prompt box, "What do you want to work on in <project>?". Enter starts a session with the
  user's **default agent** (Claude or Codex, saved in `settings.json` through the settings IPC),
  with the prompt as its first message. The box never names a specific agent.
- **Pick up where you left off:** agent sessions closed from the project (only ones with a
  conversation), newest first, at most 5, saved with the layout in `workspace.json`. Clicking one
  resumes the session. Sessions in a removed worktree are forgotten.
- **Open tasks:** the first three To do issues, started with the default agent.

On screen, Claude/Codex terminals are "agents" and plain terminals are "shells"; "pane" remains
only a code name. Repos stay "projects": a dugout full of agents working on many projects.

**Not done (yet).** ⌘T still opens Claude rather than the default agent, and the prompt box has no
worktree toggle.

## 027 — A welcome screen for first launch (2026-10-07)

**Context.** With no projects, the app showed one heading and two buttons on an empty window.
New users had to know where their repos were, and found out only later whether the agent CLIs
were installed or what GitHub sign-in unlocks.

**Decision.** With no projects, `features/welcome/WelcomeScreen.tsx` shows a full-width hero and
three steps on how Dugout works, then two columns (one below 900px): repos on this Mac on the
left, GitHub and the agent check on the right.

- **Add project… / Clone repository…** in the hero, as before.
- **On this Mac:** git repos in the usual code folders (`~/Developer`, `~/code`, `~/Projects`,
  … and the remembered clone folder), at most two levels down, most recently changed first.
  One click adds a repo as a project. Documents and Desktop are searched only when the user
  clicks "Also look in Documents and Desktop", because reading them shows a macOS permission
  prompt. Searching never starts from the home folder itself, which holds those folders.
- **GitHub:** signed out, a card explaining what sign-in unlocks (one-click clone, tasks from
  issues, PR and CI status). Signed in, the five most recently pushed repos, each cloned into
  the remembered folder and added in one click.
- **Agents:** whether `claude` and `codex` are on the PATH of the user's interactive login
  shell (`command -v`, the same way terminals launch them), with the install command when
  one is missing.

The search and the check live in `services/welcome/` behind the read-only `welcome` IPC domain.

## 028 — Field green on the welcome screen; inside a project, its own colour (2026-10-07)

**Context.** The first-run screen fell back to a generic blue and looked plain, and Dugout had
no colour of its own.

**Decision.** The logo's palette becomes brand tokens (`--field-deep`, `--field`,
`--field-bright`, `--chalk`, `--clay`, and the four agent dots). They are used only where no
project is open: `--accent` defaults to `--field` (#1d6b48, white text 6.5:1), and the welcome
screen opens with a field-green hero carrying the logo (`lib/Logo.tsx`, coloured from the
tokens), with step numbers in the logo's colours. Once a project is selected, everything (title
bar, rail, status bar, buttons, focus, panes) is that project's colour, as in decision 023, so
projects stay clearly apart.

The traffic lights (`trafficLightPosition`), tabs, "+" and the title bar's end items share the
tab row's centre line (`--tab-height`). The selected tab is marked Chrome-style: a white card that
merges into the window, with a bold name and the project's colour dot; no accent line.

## 029 — Projects are named after their folder; colours are random; tabs close with × (2026-10-07)

**Context.** Adding a project asked for a name and a colour, and the tab's ⋯ reopened that
dialog to change them. Neither choice was worth a step: users know repos by their folder name.

**Decision.** `ProjectStore.add` takes only a folder. The name is always the repo folder's name
(projects saved with a custom name are renamed on load), and the colour is picked at random
among the colours no project uses (any colour once all are taken). The add/edit dialog and the
`project:update` IPC are gone: picking a folder adds it straight away, and errors (not a git
repo, already added) show in the window. The tab's ⋯ is now ×, which closes the project (the
folder stays on disk); if it has agents or shells open, a confirmation says they will stop. The
title bar's "+" shows only once there is a project, since the welcome screen offers the same.

## 030 — Fetch from Source Control, never pull (2026-10-07)

**Context.** Dugout never talked to the remote except to push, clone or open a PR, so the ↓behind
count and "Remote branches" went stale. The ↻ next to the branch only re-read local status, which
the panel already does on an interval and on focus.

**Decision.** That ↻ is now Fetch: `GitService.fetch` runs `git fetch --all --prune` through
`runNetwork` (credentials, no prompts; decisions 009 and 015), then the status refreshes. It sits
next to the branch and its ↑/↓ counts, the things it updates, and spins only while fetching. Fetch
never changes files, so it is safe while agents work and needs no warning. There is no pull: it
would change agents' files mid-task, and merging is work for the agent (a git client is out of
scope). The branch picker's search now reads "Search or create a new branch", so creating one is
not hidden.

## 031 — Agents list in the sidebar (2026-10-08)

**Context.** With several agents in a project, each one's status sat only in its own terminal
header, and the Inbox shows just the ones that need you. There was no single view of what all of
a project's agents were doing.

**Decision.** The left sidebar is split: the Explorer on top, **Agents** below, with a draggable
divider. The list shows the selected project's agents (Claude and Codex; shells are left out,
since they have no status beyond running), in terminal order: number, agent, status (the usual
status dot and text), the task or title it was started for, its worktree branch, and the latest
hook detail. Clicking a row focuses that terminal. The arrow in its header minimises the list
down to that header so the Explorer gets the full height, and brings it back up
(`agentsStore`); ⌘B still hides the whole sidebar. Other projects' agents stay in the Inbox.
Per-agent colours were tried and dropped: status colours are enough.

## 032 — Subagents in the Agents list, from hooks (2026-10-08)

**Context.** Claude Code and Codex can start subagents inside a session. They have no terminal of
their own, so the Agents list never showed them, and a long "Working" spell gave no hint that the
work was spread over several subagents.

**Decision.** Both CLIs send `SubagentStart` (`agent_id`, `agent_type`) and `SubagentStop` (also
`last_assistant_message`); verified in Claude Code 2.1.294 and codex-cli 0.155.0. Dugout binds
both (`subagent-start` / `subagent-stop` signals, which forward the payload) and passes them from
`HookServer` through `TerminalManager.applySubagent` to the renderer on their own channel; they
never change the agent's status. Under each agent row the list shows its subagents as `↳ type`
with Running or Done, running first, at most five and "+N more"; a finished one's tooltip is the
first line of its reply. Finished subagents clear when the agent starts its next turn (idle or
done → working); running ones stay until they stop or the terminal exits or restarts, so
background subagents stay visible after the parent is Done. Subagent lines are part of the
parent's row: clicking focuses the parent terminal, and a subagent's permission prompt is the
parent's "Needs you".

## 033 — Readable terminals and visible dividers (2026-10-08)

**Context.** With several agents side by side, terminal text was hard to read. Claude Code draws
tool output, hints and recaps as dim text, which xterm paints at half opacity: on the light
background that fell to about 1.6:1. The 12.5px regular-weight font and 1.5 line height made it
look thinner still, and the `--border` lines between panes and panels (about 1.2:1) almost vanished.

**Decision.** xterm sets `minimumContrastRatio: 4.5`, so any text colour (dim included) below
4.5:1 is darkened; colours already readable are untouched. The terminal font is 13px at weight
500 (bold 700) with a 1.3 line height, and the palette's greys are darker (`white` `#6b7280`,
`brightWhite` `#8a919c`); `xtermOptions.test.ts` checks every colour's contrast. A second line
token, `--divider`, marks lines between areas (pane and panel separators, terminal headers, the
rail edge, the status bar, the editor tab strip); `--border` stays for inner hairlines (rows,
cards, inputs), so the UI does not get busy. The focused pane keeps its project-colour underline.

## 034 — Leaner, richer task tools for agents (2026-10-09)

**Context.** Filing #17–#29 through the "dugout" MCP server (decision 018) showed six gaps
(issue #30): `list_tasks` returned every body (~6k tokens for 13 tasks), there was no priority,
no way to link tasks, one call and one approval per new task, writes echoed the whole issue back,
and an empty list did not say what it covered.

**Decision.**

- `list_tasks` returns `{ covers, tasks }`: per task only number, title, status, priority, labels
  (without `dugout:*`, which status and priority already express) and updatedAt; `get_task` has
  the description. `covers` and the tool description say the list spans open and closed issues,
  every status, the 300 most recently updated, plus any filter applied. Tasks are ordered by
  priority (high, medium, low, none), most recently updated first within one. A `search` filter
  keeps tasks whose title or description contains every word (any case), so agents can look for
  duplicates before creating.
- Priority is a `dugout:priority-high|medium|low` label, like the status labels: at most one,
  created in Dugout's colours on first use. `create_task` takes `labels` and `priority`;
  `update_task` takes `priority` (`"none"` clears it), `addLabels` and `removeLabels`, applied to
  the issue's current labels so status labels survive. Agents cannot set `dugout:*` labels
  directly. Other missing labels are left for GitHub to create.
- Relationships are plain `Related: #n` lines appended to the description (`related` on create
  and update; numbers already listed are skipped). GitHub links them and shows the mention on the
  other issue. GitHub sub-issues were not used: they need a second API (issue ids, not numbers)
  and a parent/child model, while "related" covers dependencies and epics well enough for now.
- `create_tasks` files up to 20 tasks in one call (one approval). The whole batch is validated
  first; tasks are then created in order, and if one fails the error lists those already created.
- Writes (`create_task`, `create_tasks`, `update_task`) return only `{ number, url, status }`, and
  results are compact JSON.
- The RPC dispatch moved from `main/index.ts` to `services/tasks/taskRpc.ts` (unit-tested); main
  still validates every call with `taskRpcSchemas` from the shared contract.

## 035 — Lucide icons for the rail and icon buttons (2026-10-09)

**Context.** The activity rail and the icon buttons in panel headers, tabs and rows used text
characters (`≡ ± ☐ + » × ⌄ › ↻ ⊟ ↺`). They did not say what they opened (`☐` read as a
checkbox), and sat at different weights and baselines depending on the font.

**Decision.** One SVG set, [Lucide](https://lucide.dev) (`lucide-react`, ISC, pinned to an
exact version), over a small custom set drawn like the logo: Lucide already has every icon
needed, in one consistent 24px grid with round caps, which a custom set would have to match by
hand for each new button; the logo's chunky filled shapes would not read at 14px anyway.
Each icon is a named ESM import and the package has no side effects, so only the 16 icons
used are bundled (the renderer bundle grew by about 12 kB, uncompressed).
Every icon goes through `lib/Icon.tsx`: `currentColor` (hover, active and project-colour states
keep working), two sizes (18px in the rail, 14px elsewhere), a 1.5px stroke at every size, and
`aria-hidden`; buttons keep their `aria-label`s and `title`s. The rail maps Explorer → files,
Git panel → git branch, Tasks → list with checks, New agent → plus. Panels hide with `»` →
chevrons-right, close with an X, menus open with a chevron-down, and the two hand-drawn chevrons
(Agents list, explorer folders) moved to the same set. Text that only contains a glyph (status
marks like "✓ Approved", "Start agent ▾") stays text.

## 036 — Pending approvals by tool call; the inbox shows them in full (2026-10-09)

**Context.** The inbox showed a ≤140-char detail (decision 019), so deciding whether to approve
meant switching to the agent to read the command or diff. Worse, status was simply the last
signal: when tools ran in parallel and only some needed approval, a `PostToolUse` from a
finished one sent `working` and hid "Needs you" while another still waited.

**Decision.** `PostToolUse` (and Claude's `PostToolUseFailure`) now send their own signal,
`tool-done`, with the payload; `UserPromptSubmit` keeps `working`. `TerminalManager` keeps each
terminal's pending approvals (`agentHooks/pendingApprovals.ts`): a `PermissionRequest` adds one,
the `tool-done` for that call removes it, and a prompt, Stop or new session clears them all. While
any is pending the status stays `needs-input`, and its detail is the oldest pending call's. Calls
are matched by `tool_use_id`, but neither CLI sends that id with `PermissionRequest` (checked in
Claude Code 2.1.295 and codex-cli 0.161), so a request without one is matched to its finish by
tool and main argument (command, file path or URL, else the whole input); identical parallel
calls each need their own finish. A `tool-done` we cannot identify changes nothing, so the worst
case is a "Needs you" that lasts until the turn ends, never one that hides. Status payloads may
be up to 4 MB (they include the tool's output); task calls and subagents keep 64 KB.

The permission request also carries a preview of the whole call (`@shared/toolCall`): a command
with its description, an edit as the file and its replacements (Edit, MultiEdit, Write,
NotebookEdit), or any other tool's arguments; each text is clipped at 8,000 characters and says
so. It reaches the renderer with the status. Inbox entries that need you show every pending call:
the command in full, or the file path with a small diff (changed lines with two lines of context,
at most 40). Opening the inbox puts the keyboard on the first entry, ↑/↓ move between entries,
and Return (or a click) jumps to the agent with the keyboard in its terminal, ready for its
prompt. Jumping uses `revealPane`, which also refocuses an agent that is already focused; the
Agents list and notification clicks use it too.

Changing the `PostToolUse` hook command means Codex asks once more to trust Dugout's hooks.

## 037 — Agent CLIs behind adapters, with capabilities; OpenCode (2026-10-09)

**Context.** Claude Code and Codex were special-cased in ~20 places (launch switch, hook config,
MCP wiring, menus, start screen, task menu, welcome check), so a third agent would multiply that.

**Decision.** Each agent CLI is an `AgentAdapter` in `src/main/services/agents/<kind>/`, listed in
`agents/registry.ts`; Claude and Codex are adapters like any other, with no special path left.
An adapter only translates: its default command and the `DUGOUT_<NAME>_COMMAND` variable that
replaces it (tests), an optional `prepare` that writes static files when Dugout starts (Claude's
hook settings), and `launch`, which turns a context (terminal id, checkout, resume or first
prompt, Dugout's task server) into a command line of plain `"$VAR"`s (decision 013) plus the
variables it reads. `TerminalManager` adds what every agent gets (`DUGOUT_TERMINAL_ID`, the hook
socket and token, `DUGOUT_RESUME_SESSION`, `DUGOUT_INITIAL_PROMPT`) and keeps the status rules,
pending approvals, resume and the inbox shared, so agents cannot drift apart. The interface was
pulled out of what Claude and Codex already did; it grows only when an agent needs more.

The renderer reads `src/shared/agents.ts`: each agent's names (`label` for menus and lists,
`productName` for its terminal header, `cliName` and install command for the welcome check) and
its capabilities: `hasStatus` (ready / working / needs you / done from hooks or a plugin;
without it an agent shows only "Running", since status never comes from scraping output,
decision 008), `hasMcp` (gets the "dugout" task server, so it is offered on tasks), `canResume`
(restored agents continue their session) and `hasUsage` (reserved for token usage, #35; no agent
has it yet). Menus, the start screen, the welcome check and "Start agent ▾" are built from the
registry; "Start agent ▾" offers each agent with `hasMcp` and every pair of them to compare.
Code outside the adapter folders never branches on an agent's kind. Agent ids (`claude`,
`codex`) are stored in layouts, settings and task worktree names and never change.

Every adapter passes one contract test (`agents/adapters.contract.test.ts`: plain `"$VAR"`s it
provides, the command from its variable, resume and prompt only when asked, the task server when
it has MCP, files cleaned up on exit) plus its own tests. The Codex hook overrides are pinned
byte for byte, because any change makes Codex ask every user to trust them again (decision 021).

**OpenCode** is the first new adapter (checked against opencode.ai's docs and its source, Oct
2026). It runs `opencode` (the TUI), `--session <id>` to resume and `--prompt <text>` for a first
message. Dugout gives it config through `OPENCODE_CONFIG_CONTENT`, the inline layer OpenCode
merges over the user's own config (plugin lists are concatenated, MCP servers added by name), so
nothing of theirs is replaced: the "dugout" server as a `local` MCP server, and Dugout's status
plugin by `file://` URL. The plugin (`<userData>/opencode-status.mjs`, written at start like
Claude's hook settings) listens to OpenCode's own events, the same ones its built-in
notifications use, and posts Claude-shaped payloads to the hook socket with Bun's `fetch`: a
session going busy is `working`, busy → idle is `done`, `permission.asked` is `needs-input` with
the call (finished by its reply or `tool.execute.after`), a question needs you until answered.
Subagent sessions (`parentID`) never change the agent's status. That maps reliably onto Dugout's
statuses, so OpenCode has `hasStatus`; it reads AGENTS.md (falling back to CLAUDE.md), so the
shared instructions (decision 022) cover it. It does not get the project's `.mcp.json` servers
yet (see known issues). `OPENCODE` and `OPENCODE_PID` are stripped from terminals like Claude's
markers. E2E tests use a fake `opencode` (`DUGOUT_OPENCODE_COMMAND`) that loads the real plugin.

**Open questions, answered.** Shortcuts: ⌘T starts the _default agent_ (chosen on the start
screen) and ⌥⌘T starts it in a new worktree; every agent is in File → New <Agent> Agent and in the
"+" menu (which marks the default's shortcuts), with "New <Agent> agent in worktree" for each.
Per-agent shortcuts would run out of keys, so Codex's ⌥⇧⌘T is gone. The "+" menu lists every
registered agent rather than only installed ones; the welcome check says which are missing. No
per-project restriction of which agents are offered; add one if a project needs it.

## 038 — Worktree setup: copy local files, run a setup command (2026-10-09)

**Context.** A new worktree is a clean checkout of HEAD, so `.env`, `node_modules/` and build
output are missing, and agents spent their first minutes installing, or failed (#19).

**Decision.** Per project and opt-in, Agent settings → _Worktree setup_ holds globs of files to
copy from the main checkout (e.g. `.env*`) and a setup command (e.g. `npm install`), saved as
`worktreeSetup` on the project in `projects.json`. Every way of making a worktree goes through
`WorktreeManager.create` (the "+" menu's "in worktree" actions, ⌥⌘T and a task's "Start agent"),
which copies the files and keeps the command for that worktree's first agent. Copies go through
`FileService`: matches are found before the worktree exists (so a bad pattern leaves nothing
behind), must be regular files inside the checkout, never in `.git`, and are refused if they or
a folder on the way are symlinks; a matched folder copies all its files; more than 500 files is
refused, pointing to the setup command for dependencies. Existing files (tracked ones) are kept,
and nothing is written through a symlink in the worktree.

The command runs in the agent's own terminal, before the agent: when an agent terminal is
created in a worktree with a pending setup, `TerminalManager` first spawns the user's login shell
with `echo "$DUGOUT_SETUP_BANNER" && eval "$DUGOUT_SETUP_COMMAND"` (plain `"$VAR"`s, decision
013, so it reads as typed in their shell), and on exit code 0 starts the agent in the same
terminal at its current size. This is shared code, not per adapter, so Claude, Codex, OpenCode
and future agents all get it. While it runs the agent shows "Starting". On failure the terminal
prints "Worktree setup failed (exit code N)" under the command's output and exits, so the pane
shows "Exited (N)" with Restart.

**Open questions, answered.** The setup runs once per worktree: a failed or interrupted setup is
offered again to the next agent there (Restart), a successful one never again. Pending setups
live in memory, so after quitting Dugout mid-setup, restored agents start without it. Shells in a
worktree never run it. The command is one line, run in the user's shell; there is no timeout,
since installs can be long and the output is visible (close the pane to stop it).

## 039 — "Open in…" an editor or Finder (2026-10-09)

**Context.** For bigger manual edits people want their own editor, but worktrees live in app
data and are awkward to find (issue #29).

**Decision.** An "Open in…" button opens a menu of VS Code, Cursor, Zed and Finder. It sits in
the Explorer header (for the checkout the Explorer shows: the project, or the focused agent's
worktree) and in the header of every worktree agent.

- **Detection:** an app counts as installed when `<App name>.app` exists in `/Applications` or
  `~/Applications`; Finder is always offered. No `open -Ra` (it reveals the app in a Finder
  window) and no Spotlight query (it can be switched off). Apps are looked up each time the menu
  opens, so a newly installed editor shows up without a restart.
- **Launching** happens only in main (`services/openIn/`): the renderer sends a checkout
  (`projectId` + optional `worktreePath`) and an app id, never a free path. Main resolves it with
  `WorktreeManager.resolveCheckout` (the project root or a Dugout-managed worktree), checks the
  folder exists, then runs `/usr/bin/open -a <App name> <folder>` with `execFile`, never a shell
  string. E2E tests swap `open` for a recorder through `DUGOUT_OPEN_COMMAND`.
- **Remembering:** the app that last opened successfully is saved as `openInApp` in
  `settings.json`. Rather than a separate one-click button, the menu marks it "last used" and
  focuses it, so `Enter` reopens it; the menu keeps a fixed order so items do not move around.
- Failures (app removed, folder gone) show inside the menu, which stays open.
- The button and the menu items use `<Icon>` (decision 035): an external-link icon next to
  "Open in…", a code icon for the editors and a folder icon for Finder.

## 040 — One-click MCP server presets in Agent settings (2026-10-09)

**Context.** Adding a common MCP server meant looking up its config and hand-writing `.mcp.json`
(issue #26).

**Decision.**

- A "Presets" list under the project's MCP servers in Agent settings: Playwright, Context7,
  GitHub, Sentry, Linear, Figma and Postgres. "Add" saves the server straight to `.mcp.json`
  through the same atomic, conflict-checked write as the server form (decision 022); a preset
  whose name is already in the file shows "Added" (a plus or check `<Icon>`, decision 035). To
  change it afterwards, edit the server.
- The presets are data in one file, `src/shared/mcpPresets.ts`; the server name is the preset's
  id. Each entry was checked against the vendor's docs or registry: `npx @playwright/mcp@latest`;
  the hosted HTTP servers of Context7 (`https://mcp.context7.com/mcp`), GitHub
  (`https://api.githubcopilot.com/mcp/`), Sentry, Linear and Figma (each `…/mcp`); and Postgres
  as `uvx postgres-mcp --access-mode=restricted` (Postgres MCP Pro, read-only), because
  `@modelcontextprotocol/server-postgres` is deprecated on npm.
- Secrets are only `${VAR}` references (`Authorization: Bearer ${GITHUB_PAT}`,
  `Bearer ${CONTEXT7_API_KEY}`, `DATABASE_URI=${DATABASE_URI}`); each preset says what to set in
  the shell or that it signs in (OAuth) on first use. Sentry, Linear and Figma use the plain
  endpoint, not an org- or project-scoped URL, so no value has to be filled in.
- Whether a preset also works in Codex agents comes from main, computed with the existing
  translation rules (`codexSharing`, decision 022), and is returned with the agent settings as
  `presetCodex`; the renderer never re-implements the rules. All current presets translate.
- Unit tests check every preset: a valid, unique, non-reserved name, it passes the save IPC
  schema, it survives a write and read of `.mcp.json` unchanged, no literal secrets, `https` URLs.
- Claude Code refuses a `.mcp.json` `${VAR}` that is unset and has no default, so a preset with
  a variable needs it set before Claude starts; `${VAR:-}` was not used because Codex cannot
  translate it.

## 041 — Review comments from the diff go back to the agent (2026-10-09)

**Context.** Review showed what an agent changed, but feedback meant switching to its terminal
and re-typing file and line by hand (issue #17). This closes the review → fix loop (decision 003).

**Decision.** In a Review diff (right-hand side) or either side of a Compare diff, select lines
(or put the cursor on one) and press ⌘⇧M or right-click › Add Review Comment. A form under the
diff shows `path:line` and the quoted code; Enter adds the comment. Commented lines are tinted
and marked in the gutter. Pending comments are grouped per checkout (Compare: per agent), and
"Send to agent" turns them into one prompt: a heading, then per comment `path:line` (or
`path:start-end`), the code quoted with `> ` (at most 12 lines), and the comment
(`reviewComments/reviewPrompt.ts`). Delivered comments are cleared.

- **Who gets it:** the agent running in that checkout (main or worktree): the focused one if
  several, else the newest. The prompt goes through xterm's `paste` (bracketed when the agent
  asked for it) and Enter follows 150 ms later, so it arrives exactly as if the user pasted it
  (`terminal/terminalInput.ts`, registered by `useTerminal`). An agent waiting for an answer
  or still starting is not typed into (Enter would answer its question); the button is disabled
  with the reason.
- **No agent there:** the button becomes "Start <default agent> with comments", which opens the
  default agent on that checkout with the prompt as its first message (the start screen's path).
- **Renderer state only.** Comments live in a Zustand store, never in the repo or on disk, and
  are lost on reload. Monaco code reaches the store from `editor/monaco/reviewComments.ts`;
  nothing outside the Monaco folder imports `monaco-editor`.
- **Open questions, answered simply:** any line on the new side can be commented, not only
  changed ones (context lines are often what feedback is about); removed lines on the left of a
  Review diff cannot. Comments keep the line numbers they were made on, even if the file is
  edited afterwards. A prompt over 10,000 characters is refused with a message.

## 042 — Verify on Stop: the project's check runs when an agent finishes (2026-10-09)

**Context.** "Done" meant the agent stopped, not that its work passes; you found out only after
reading the diff or running the checks yourself (issue #18).

**Decision.** A project can have a check command (e.g. `npm run check`), set under "Verify on
Stop" in Agent settings and off by default. Each time an agent with status (`hasStatus`,
decision 037; no kind checks) reports Done, main runs that command in the agent's checkout (the
project or its worktree) and reports the result to the agent's renderer.

- **Where it runs:** `services/checks/CheckRunner` owns one check per agent terminal, run by
  `spawnCheck` as `$SHELL -l -i -c <command>` (PATH and profile as in the user's terminal) with
  the terminal environment plus `NO_COLOR=1`, in its own process group so cancelling also stops
  what it started. Never in the agent's PTY. `registerTerminalIpc` tracks each terminal it
  creates and forwards its status events, so results go only to the window that owns it, and a
  terminal that exits (or a window that reloads) kills its check.
- **Status** is a discriminated union (`shared/checks.ts`): `idle`, `running`, `passed` (with its
  duration) or `failed` (exit code, or null when stopped, and the output's tail without colour
  codes, at most 6,000 characters). A new Done while a check runs kills it and starts again. A
  new turn (Working) cancels a running check and clears the result, since the code is changing
  again. A check still running after 30 minutes is stopped and reported as failed.
- **Where it shows:** an icon plus words (never colour alone): "Checking…", "Check passed",
  "Check failed" on the agent's header, on its entry in the inbox, and on the task card (icon
  only, named in its description) and task tab, where several agents show the most urgent one.
  "Check failed" in the header opens the command's output with **Send failure to agent**, which
  sends the command, exit code and output to the agent on that checkout through the shared
  `reviewComments/deliverPrompt` (decisions 041, 045): typed in, never while it is starting or
  waiting for an answer, or as the first prompt of a new default agent if it has gone.
- **Open question, answered:** the command is stored in Dugout's app data, as `checkCommand` on
  the project in `projects.json` (like the dev command, decision 049), not in a committed
  `.dugout/` file. It is a personal choice of what to run on each stop, needs no repo change or
  commit, and a repo's own scripts already say what its checks are. The IPC payload is one line
  of at most 500 characters; blank turns it off.
- No queue: parallel agents' checks run at the same time, each in its own checkout. Results
  live only as long as the agent's terminal (see `docs/known-issues.md`).

## 043 — Task cards, and tasks open in an editor tab (2026-10-09)

**Context.** The Tasks panel listed tasks as one-line rows (`#n` and a cut-off title), showed
issue bodies and comments as raw markdown, and opened a task by replacing the list inside the
narrow side panel, so long tasks were cramped and you lost your place (issue #36).

**Decision.**

- **Cards.** Each task is a card (`TaskCard.tsx`): the title on up to two lines (full title in a
  tooltip), a muted line with `#n`, when it was updated (`formatAge`), the comment count and its
  priority (`dugout:priority-*`, as a small "High/Medium/Low" word), and a footer with its labels
  (Dugout's own `dugout:*` labels hidden) and the agents on it (kind + live status). A status-
  coloured left edge (the `--status-*` tokens) repeats the group it sits in, which says the status
  in words. Cards lift on hover; the card's accessible name stays `#n title`.
- **Groups** collapse, with counts; which are open is remembered in the renderer's local storage
  (a view preference only, validated on load). Done starts collapsed and still shows the ten
  most recent. ↑/↓ move between group headings and cards (↓ from the search box enters the list);
  Enter opens a card.
- **Task detail opens in the center, as an editor tab** (kind `task`, id `task:<n>`), the way
  Compare and Agent settings do, rather than a wider panel: the tab model already holds non-file
  tabs, so this needed one tab kind and no new layout, and the list stays in the panel with the
  open task marked. A click opens a preview tab (replaced by the next preview, as for files); a
  double-click, or acting on the task (status, comment, start agent), keeps it. The page has a
  readable width; the panel no longer has a detail view. Open task tabs register with the task
  store, so refreshes reload their details.
- **Markdown** (descriptions, comments, and a Write/Preview toggle on the new-task and comment
  boxes): `react-markdown` + `remark-gfm` (pinned exact), the smallest renderer that covers GFM
  task lists and tables, and builds React elements instead of HTML strings. No `rehype-raw`, so
  raw HTML (including `<script>`) is dropped. Links render only for `https:` URLs and open in the
  browser through main's window-open handler (which allows only `https:`); others, like
  `javascript:`, become plain text. Images become links, so a task never loads remote content.
  Task-list checkboxes are read-only.

## 044 — Warn when parallel agents change the same files (2026-10-09)

**Context.** Agents in separate worktrees could edit the same files, and you only found out at
PR or merge time (issue #24).

**Decision.** The renderer tracks what each live worktree of the visible project changed since
its branch left the base branch, with the same `GitService.changesSince` call Compare uses
(`compare.changes`, now up to 32 worktrees per call, reading the base branch once). It refreshes
with the existing change polling in `useCheckoutRefresh` (every 3s, on focus and on agent status
changes), only when there are two or more worktrees. "Live" means every worktree Dugout lists
for the project plus any an open agent runs in, whether or not an agent is still open: a
finished session's changes still meet the others at merge time.

Overlap detection is a pure function (`features/overlaps/overlaps.ts`): two worktrees overlap
when they changed at least one same file. Worktrees whose agents work on the same task are
skipped: they are competing attempts (e.g. Claude + Codex), which Compare already shows. The
other side is named by its task ("#12"), else its agent and worktree ("Codex (k3x9)"), else the
worktree name. The warning is an amber triangle icon plus "also changed by #12, …" (never colour
alone), with the files in its tooltip: on the agent headers, task cards and task tabs involved,
and per file in Compare for worktrees beyond the two compared.
It is advisory only: nothing is blocked, merged or changed. Files are compared whole (not line
ranges) and agents in the main checkout are not tracked; see `docs/known-issues.md`.

## 045 — PR review comments and failing CI go to the agent (2026-10-09)

**Context.** The git panel showed a branch's PR, review decision and checks (decision 020), but
acting on them meant opening GitHub, copying comments or logs and pasting them into an agent
(issue #21).

**Decision.** While the PR is open (or draft), its "Pull request" block has two buttons.
"Address review comments" fetches the unresolved review threads; "Fix failing CI" (shown only
while checks fail) fetches the failing checks. Either is turned into one prompt and delivered
exactly like review comments from the diff (decision 041): typed into the agent working on that
checkout, or the default agent is started there with it as its first prompt. A line under the
buttons says what was sent, that there was nothing to send, or why it could not be sent.

- **Review threads come from GraphQL** (`reviewThreads`, first 100 threads × 20 comments), since
  REST review comments do not say whether a thread is resolved. It is one `POST /graphql`
  through the existing `githubJson` helper; nothing else changed. Outdated threads are kept,
  with their original lines and an "(outdated)" note; resolved ones are dropped. The prompt lists
  `path:line` (or `path:start-end`) and then each comment as `author: text`.
- **Failing CI** is the failing check runs and commit statuses on the PR head (same rules as
  decision 020). For the first 5 runs it adds the run's title/summary, up to 10 failure/warning
  annotations (notices are noise), and for GitHub Actions the end of the job log: lines up to the
  last `##[error]` (cleanup steps come after it), at most 40, each clipped to 300 characters,
  without colours, timestamps or group markers. Other check providers and statuses get their
  title and link only.
- **Trimmed to fit.** Each comment or summary is clipped at 1,500 characters, and the whole
  prompt fits the 10,000-character first-prompt limit: entries that do not fit are counted
  ("… and 3 more on GitHub.") rather than cut mid-way (`git/pullRequestPrompt.ts`).
- **Token stays in main** (decision 015). The renderer asks with the checkout and PR number;
  main resolves the repo from the checkout's remote and calls GitHub (`GitHubPullFeedback`).
  Job logs are a redirect to a signed download URL; `fetch` drops the token on that
  cross-origin hop.
- **Open questions, answered simply:** nothing is posted back to GitHub (no replies, no resolving
  threads); the agent can do that itself. The buttons do not pre-count comments, so "Address
  review comments" can answer "No unresolved review comments."

## 046 — Token usage per agent, task and project, from Dugout's own ledger (2026-10-09)

**Context.** There was no way to see how many tokens an agent is using, or what a task or a
project used over time (issue #35). Generic tools total by folder; only Dugout knows which
project, task, worktree and agent a session belongs to. Claude Code deletes transcripts after
`cleanupPeriodDays` (30 by default), so lifetime totals cannot be read from them later.

**Decision.**

- **Hooks name the transcript; main reads it.** Claude and Codex hook payloads carry
  `transcript_path` (SubagentStop also `agent_transcript_path`). On every forwarded hook event
  (ready, tool-done, needs-input, done, subagents) main reads only the bytes added since the last
  read of that file (an offset per file; a partial last line waits for the next read). No PTY
  polling. A path is read only if it is a `.jsonl` file whose real path is inside the agent's own
  folder (`~/.claude` or `CLAUDE_CONFIG_DIR`, `~/.codex` or `CODEX_HOME`).
- **Adapters own the format** (decision 037): `AgentAdapter.usage` gives the transcript folder
  and a parser; `hasUsage` is true for Claude and Codex. The parsers live in
  `services/transcripts/` so the session timeline (#22) can reuse them. Claude: every assistant
  reply's `message.usage`, counted once by `message.id` (streamed replies repeat their line;
  forked or resumed sessions copy earlier replies), subagent sidechains included; uncached input,
  output, cache reads and cache writes (1-hour writes kept apart for pricing). Codex: the last
  `token_count` running total per session, counted as its growth since the last one recorded
  (a total that goes down started over). Unknown entry types and malformed lines are skipped.
  OpenCode keeps `hasUsage` false for now (see known issues).
- **Dugout's own ledger, in app data** (`usage/`): an append-only `ledger.jsonl` (one line per
  counted reply or total growth, with project, agent, task, session, checkout, model, tokens and
  cost) and `state.json` with rollups by day × project × agent × model × task, sessions, dedupe
  ids and read offsets, saved at most every 2s and on quit. On start, ledger lines newer than
  the state are replayed, so a crash loses nothing. JSON, not SQLite (decision 005): the rollups
  are small and every view is built from them. Dedupe ids, sessions and offsets untouched for 120
  days are pruned; totals are kept forever.
- **Attribution:** the terminal's project, its task (the renderer passes `taskNumber` when an
  agent starts on a task; by number, as tasks are elsewhere) and the hook's session id; the
  checkout is recorded too. Day = the reply's local date.
- **Tokens first; dollars as an estimate.** The headline is input + output + cache writes; cache
  reads are shown apart so they never swamp it. Cost is labelled "API-equivalent cost (estimate)"
  everywhere: subscriptions do not pay per token. Prices are one table, `usage/prices.ts`, dated
  (`PRICES_AS_OF`, checked 2026-10-09 against Anthropic's and OpenAI's pricing pages): standard
  tier, short-context prices, 5-minute and 1-hour Claude cache writes, OpenAI cached input. Cost
  is computed when usage is recorded, so a later price change does not rewrite history; models
  missing from the table count as "unpriced tokens".
- **UI.** Agent headers: tokens this session and context-window use ("302k tok · 30% ctx"), from
  the latest main-conversation call (Codex reports its window; Claude's comes from the table,
  1M for `[1m]` models), with a warning icon and "may compact soon" from 80%. Project tab
  tooltips: lifetime and last-30-days totals (loaded on hover). Task cards and task tabs: the
  task's total across all its sessions; Compare (from a task) shows each agent's tokens on it. A
  Usage view (editor tab kind `usage`, from View → Token Usage or the rail's "+" menu): lifetime
  and last 30 days, per day by agent kind, per agent, model and task.

**Open questions, answered.** Storage: JSON aggregates, not SQLite, until a query needs more.
Import of earlier sessions: not now; usage counts from when an agent ran in Dugout (a resumed
older session's earlier replies are counted on their own days). Budgets and alerts: not now.

## 047 — A task queue: the next task starts when an agent slot frees up (2026-10-09)

**Context.** Running many agents meant starting each task by hand and keeping count of how many
were running (issue #23).

**Decision.**

- **Queue.** "Queue ▾" sits next to "Start agent ▾" on a task's tab and offers each agent with
  the task tools (one agent per queued task; comparing two agents stays a "Start agent" choice).
  A queued task shows "Remove from queue" instead. The Tasks panel shows the queue at the top
  while it has tasks: position, title, key and agent, "Move #n up / down" (↑/↓ buttons) and
  "Remove #n from queue", and "2 of 3 agents busy".
- **Limit.** "Max agents at once" (1–20, default 3) is set per project in Agent settings → Task
  queue. It only holds back the queue: starting an agent yourself never waits.
- **Slots.** Every agent in the project counts (not shells, and not only task agents, since
  restored agents no longer know their task): it holds a slot while it is starting, running,
  working or needs you. **Done frees the slot, and so do Ready and closing its terminal.** An
  agent in Needs you keeps its slot, so nothing new starts while you are being asked something.
  Done rather than only closing: agents idle at Done (and their worktree stays for review), so
  waiting for the terminal to close would stall the queue on every finished agent. A task agent
  that was just started holds its slot even at Ready until it works, asks, finishes or closes
  (an agent with a first prompt can say Ready for a moment before it works); so does a start
  whose worktree is still being created. An agent that is Done and is then prompted again counts
  again, so the project can briefly run more than the limit; the limit only decides when queued
  tasks start.
- **Starting.** The renderer (`features/taskQueue/useTaskQueueRunner`) starts the first queued
  tasks while slots are free, through `taskStore.startAgent`, the same path as "Start agent":
  a new worktree, its setup (decision 038), the task as the first prompt, the task moved to In
  progress. The task leaves the queue as it starts; if it fails to start, it stays off the queue
  and the error shows in the queue (queue it again to retry). The transitions are pure,
  unit-tested functions: `applyQueueChange` (add, remove, move; `shared/taskQueue.ts`) and
  `settleLaunches`, `busySlots`, `tasksToStart` (`features/taskQueue/slots.ts`).
- **Persistence.** The queue (`taskQueue`, at most 100 tasks) and the limit (`maxAgents`) are
  stored on the project in `projects.json`, like the other per-project settings (decisions 042,
  049). The renderer sends changes (add, remove, move) rather than whole queues, and
  `ProjectStore` applies every change in turn on the latest state, so two tasks starting at once
  never undo each other. Nothing starts while the app is closed; on launch the queue waits until
  saved agents are restored, so a relaunch never starts more than the limit.

## 048 — Session timeline from agent transcripts (2026-10-09)

**Context.** Review showed what an agent changed but not how: which tools ran, in what order,
what failed, and what it said between steps (issue #22). The transcripts that token usage reads
(decision 046) already hold all of it.

**Decision.**

- **Read on request, in main, read-only.** `timeline:session` takes an agent kind and a session
  id (zod: a plain id, so it can never name a path). `TimelineService` finds the transcript by
  that id under the agent's own folder (Claude: `projects/*/<id>.jsonl`; Codex: the
  `sessions/` tree, newest dates first, for a file ending `<id>.jsonl`) and reads it only if
  `allowedPath` (moved from the usage service into `transcripts/transcriptFiles.ts`) says its
  real path is inside that folder. Nothing is cached or written; the transcript is the record.
  Finding by id, rather than remembering paths from hooks, also covers closed and resumed
  sessions after a restart.
- **The parsers sit with the usage parsers** in `services/transcripts/`, reusing their line
  helpers. Each format (`claudeTimeline.ts`, `codexTimeline.ts`) turns entries into steps;
  `buildTimeline` does the rest for both: tool results give each call its outcome (ok, failed,
  or no result yet), repeated lines (streamed, resumed) count once, and the final message is
  Codex's own `task_complete` record or else the agent's last text. Unknown entry types,
  thinking/reasoning and malformed lines are skipped.
  - Claude: prompts (slash commands as typed; meta lines skipped), assistant text, `tool_use`
    with its main argument (command, file, pattern, URL…), `tool_result.is_error`, and Agent
    (or older Task) calls as subagents with their type. Subagents' own sidechain lines are left
    out: the call stands for them. Files: Edit/MultiEdit/Write/NotebookEdit edit, Read reads.
  - Codex: prompts from `user_message` events or `item_completed` UserMessage items (response
    items with role user carry injected context, so they are not used), assistant messages,
    function / custom tool / local shell calls, outputs failing on a non-zero exit code,
    `apply_patch` files from the patch headers, and `spawn_agent` as subagents.
- **Adapters say whether they can** (decision 037): a `timeline` reader (find + read) on the
  adapter, present exactly when `capabilities.hasTimeline`, and only with a `usage` reader whose
  folder it searches. Claude and Codex have one; OpenCode does not (no transcript file), so the
  UI hides its timeline buttons.
- **Caps.** A transcript over 16 MB is read from its last 16 MB (its latest steps); at most
  1,500 events (the latest) and 300 files are kept; prompts and messages are cut at 2,000
  characters, the final message at 8,000, tool arguments at 240 on one line. The view says when
  anything was left out.
- **UI.** An editor tab (kind `timeline`, one per session) like Usage and Compare: a summary
  (prompts, tool calls and failures, subagents, files edited), the final message, files touched
  (edited, then read; paths relative to the session's folder), and the steps in order with time,
  icon and outcome in words. It opens from the agent header's timeline icon button (once the
  conversation has started) and from a task tab's "Claude timeline" buttons (the task's open
  agents, then closed sessions the project still remembers); tabs are named "Timeline · Claude ·
  ENG-12". It reloads when the project's usage changes (the same hook events), so a working
  agent's timeline grows, and has a Refresh button.
- **Tokens and cost stay in Token usage** (decision 046): the timeline only links to it.

**Open questions, answered.** Live updates: reload on the usage-changed event rather than
watching files. Subagent internals: not shown step by step for now (the call and its outcome
are). History for a task: its open agents plus the 5 closed sessions each project remembers.

## 049 — Preview URLs and dev servers per worktree (2026-10-09)

**Context.** Checking UI changes an agent made meant starting a dev server by hand in the right
worktree on a free port, or hunting for the deploy preview (issue #28).

**Decision.**

- A "Preview" block in the git panel, under the Pull request block, for the selected checkout.
- **Preview deployment:** `GitHubDeployments.forBranch` reads GitHub deployments and their
  statuses (which Vercel, Netlify and Actions report) through the shared REST helpers, so the
  token stays in main (decision 015). Deployments are matched by `ref=<branch>`; when none match,
  by the SHA the branch points to on GitHub (providers that deploy by commit). The newest
  deployment gives the state (Ready / Deploying / Failed, as text, not colour alone; replaced
  "inactive" ones are skipped); the URL is the newest ready one's `environment_url` (else
  `target_url`), only if it is http(s). Up to 5 deployments are looked at. It refreshes like the
  PR block (60s, focus, push state; one `useBranchPoll` hook for both). Only the newest
  environment is shown, even in monorepos with several.
- **Dev server:** each project has an optional one-line dev command, stored on the project in
  `projects.json` (where its colour lives) and edited in place ("Set dev command…" / pencil).
  "Run" opens a new shell pane in that checkout (main or worktree) through the normal `addPane`,
  started with `PORT` set, and types the command into it, so the shell stays open after Ctrl-C
  and ↑ reruns it. The block then shows `localhost:<port>` with "Show" (focus the shell) and
  "Open". One dev server per checkout; closing its shell stops it. Dev server shells are not
  restored on relaunch: they come back as plain shells (see known issues).
- **Ports:** main assigns them from 4100–4199 (away from 3000/5173 defaults), skipping ports
  given to open dev server shells in any project and probing each candidate by binding it on
  `127.0.0.1` and `::`. The candidate list and the search are pure and unit-tested with a fake
  probe. Servers that ignore `PORT` (e.g. Vite) need `--port $PORT` in the command.
- **Links:** `preview:open-url` opens only http(s) URLs that are either a preview URL main itself
  reported or `http://localhost:<port>/` — never an arbitrary URL from the renderer. The GitHub
  link channel (`git:open-url`) is unchanged.

## 050 — Project context agents read over MCP, curated in a Context tab (2026-10-09)

**Context.** Every agent session started cold. CLAUDE.md / AGENTS.md hold rules, but there was
no place for the growing body of project knowledge (decisions, gotchas, which files matter, what
past agents learned) that every agent can read and people can curate (issue #20).

**Decision.**

- **Entries.** Kinds: note, pinned file or folder, link (http(s) only), imported document (a
  Markdown or text file picked from disk, copied in, up to 100 KB) and one codemap. Each is a
  Markdown file with a small front matter block (`kind`, JSON-quoted `title`, `path` / `hash` /
  `url` / `source` / `agent`, `updated`); its id is the file name. A plain Markdown file dropped
  in by hand is read as a note titled by its first heading; broken fields fall back to a note,
  so nothing disappears.
- **Storage and scope.** Shared entries live in `.dugout/context/` at the project's main
  checkout, written through `FileService` (path-safe; it now also resolves the nearest existing
  folder of a new file, so a symlinked `.dugout` cannot lead a write out of the repo). They are
  ordinary files for the team to review and commit; Dugout never commits them. Private entries
  and agents' proposals stay in app data (`context/<projectId>/`, owner-only files). Agents in
  worktrees read the main checkout's context, like Agent settings. Ids are unique across shared,
  private and proposed; a shared entry hides a private one with the same id.
- **Staleness.** A pinned path stores a SHA-256 of the file, or of a folder's file names and
  contents (skipping `.git` and `node_modules`, at most 2,000 files). Every read compares it:
  "Changed since pinned" or "No longer in the project" (text plus an icon), until "Mark as
  current" takes the new content as the baseline.
- **Agents (MCP).** The "dugout" server (decision 018) gains `list_context` (index only: id, kind,
  title, scope, path or link, and a pin flag when stale or missing; no bodies), `get_context(id)`
  (one entry's body), `search_context(query)` (every word in title, path, link or body, any
  case; at most 20 hits with a snippet) and `add_note(title, body)`. Calls go over the hook
  socket RPC as `context.*` methods, are validated in main with `contextRpcSchemas` and scoped
  to the terminal's project, exactly like the task tools; so every agent with `hasMcp` (Claude,
  Codex, OpenCode) gets them, and context works without GitHub sign-in.
- **Approval.** `add_note` only creates a **proposal** (with the proposing agent's kind) and tells
  the renderer (`context:changed`). The rail's Context button shows how many wait; the Context
  tab shows each in full with "Approve and share" (it becomes a shared note in
  `.dugout/context/`) or "Discard". Agents never write shared or private entries directly.
- **UI.** A Context editor tab per project (kind `context`, like Agent settings and tasks),
  opened from a rail button (Lucide `BookOpen`, "Project context"): proposals, the entries
  (kind, Shared / Private, path or link, Markdown on demand, Edit, Remove) and one form to
  add a note, file or folder, link, or import a document, shared or private.
- **Codemap.** "Build codemap" runs the user's **default agent** headlessly through its adapter:
  `AgentAdapter.headless(command)` returns a plain `"$VAR"` command line that answers
  `$DUGOUT_HEADLESS_PROMPT` on stdout (Claude: `claude -p`), run in the user's login shell in the
  project root with the terminals' cleaned environment (10 minute limit), and the answer becomes
  the shared `codemap` entry, replaced on each build. No hooks, no Dugout tools, no direct model
  calls. Only adapters with the new `canRunHeadless` capability have it (just Claude for now);
  the button is hidden otherwise. E2E tests use the fake `claude`'s `-p` answer.

**Open question, answered.** Agents learn about context from the MCP server itself: the tool
descriptions say what each is for, and the server's `instructions` (sent when it connects) carry
one line: call `list_context` early. That reaches every agent that has the server, needs nothing
in AGENTS.md (which is the user's file) and no per-agent SessionStart hook (Codex and OpenCode
differ there). Context stays pull-based: nothing is pasted into prompts.

## 051 — Linear as a task source, chosen per project (2026-10-09)

**Context.** Tasks were GitHub Issues only (decision 018); many teams that run agents track work
in Linear (issue #27).

**Decision.**

- **Per project.** A project has an optional `taskSource` in `projects.json`: absent means GitHub
  Issues (so existing projects are unchanged), or `{ kind: "linear", teamKey: "ENG" }`. The Tasks
  panel's "Task source" button (and "Use Linear instead" when not signed in to GitHub) picks GitHub
  Issues or Linear and a team. `TaskService` resolves the project's source into a `TaskProvider`
  (`tasks/taskTypes.ts`); callers (IPC, the agent RPC, "Start agent", "Closes …") never branch on it.
- **Task ids.** Tasks stay numbered: `number` is the GitHub issue number, or the number in a
  Linear identifier, scoped to the project's team (ENG-123 → 123). Each task also carries `key`,
  how its source writes it ("#123" or "ENG-123"), shown on cards, tabs, agent headers, the inbox
  and overlap warnings; panes remember it (older layouts fall back to "#n"). This kept branch
  names (`dugout/<n>-slug`), tab ids, the MCP tools' `number` argument and every store keyed by
  number unchanged. Linear looks issues up by identifier (`issue(id: "ENG-123")`). An issue moved
  to another team gets a new identifier and drops out of the list, which is accepted.
- **Auth.** A Linear personal API key, sent as the bare `Authorization` header (Linear's GraphQL
  API at `api.linear.app/graphql`, checked against linear.app/developers, Oct 2026). Connecting
  checks the key with a `viewer` query before saving it, so a typo never replaces a working key.
  It is stored like the GitHub token (decision 015): `safeStorage`-encrypted in
  `<userData>/linear-key.bin` (0600), never sent to the renderer (which sees only the account
  name and organisation) or to agents; unit and e2e tests assert it. One key for the app, so one
  Linear workspace. OAuth is out of scope: it needs a registered app and a redirect flow, while
  personal keys are what Linear's docs offer for scripts and local tools.
- **Statuses** map by workflow state _type_, which every team has, rather than by name:
  completed, canceled and duplicate → Done; started → In progress, or In review when the state's
  name contains "review" (any case) or the issue has the `dugout:in-review` label; triage,
  backlog and unstarted → To do. Writing a status moves the issue to the first state (by
  position) of the matching type: To do → unstarted (else backlog), In progress → the first
  started state not named like review, Done → completed. In review → a started state named like
  review if the team has one; otherwise the first started state plus the `dugout:in-review` label
  (created in the team on first use), removed again on any other status. An issue that already
  reads as the requested status is not moved, so custom states such as "QA" are kept.
- **Priority** is Linear's own: urgent (1) and high (2) read as high, medium (3), low (4), none
  (0); Dugout writes high as 2. `Task.priority` is now a field for both sources (GitHub still
  stores it as a `dugout:priority-*` label, decision 034).
- **Labels** resolve by name to the team's or workspace's labels; missing ones are created in the
  team. Related tasks are "Related: ENG-n" lines, which Linear links like GitHub links "#n".
- **"Closes …"** in a PR from a task branch uses the key, so Linear's GitHub integration closes
  ENG-123 on merge as GitHub closes #123. "Start agent" and the agent's first prompt ("You are
  working on task ENG-123 …", with the number the tools take) work the same for both.
- **MCP tools** stay provider-agnostic: descriptions no longer say GitHub, results add `key`.
- **Cost.** Lists ask for 100 issues per page (up to 300) with up to 20 labels each, well under
  Linear's 10,000-point query limit; comment counts are not fetched for lists (cards show them
  only for GitHub), since they would multiply the complexity of every 30-second refresh.

## 052 — Packaging: minified bundles, renderer deps are devDependencies (2026-10-09)

**Context.** The v0.4.0 DMG was 161 MB. electron-builder adds every production `dependency` to
app.asar on top of the `files` list, so Monaco, React, xterm and the other renderer packages
shipped twice: bundled in `out/renderer` and again as raw `node_modules` (~164 MB, Monaco alone
102 MB). electron-vite also leaves every bundle unminified.

**Decision.**

- **`dependencies` holds only what main loads at runtime:** `node-pty`, `zod` and
  `@modelcontextprotocol/sdk` (electron-vite externalises them from the main and MCP bundles).
  Everything the renderer imports is a devDependency, since Vite bundles it.
- **Minify the renderer only** (esbuild). Main and preload are a few hundred KB, and readable
  stack traces in their logs are worth more than the bytes. No sourcemaps: nothing symbolicates
  them yet; revisit with crash reporting.
- **`npmRebuild: false`:** node-pty's N-API prebuilds run in any Electron, so the rebuild is
  wasted work. The packaged e2e suite (`npm run test:e2e:packaged`) covers it.
- **`!out/demo/**`** keeps `npm run demo:gif` footage out of the app.

Result: app.asar 30 MB, DMG 134 MB (from 161 MB); the rest is Electron itself.

## 053 — Agents get read-only Dugout tools pre-approved; writes prompt (2026-10-09)

**Context.** Claude's hook settings allowed `mcp__dugout`, the whole server (decision 018), so
`create_task`, `create_tasks`, `update_task` and `comment_on_task` ran without a prompt. Those
post to GitHub Issues or Linear with the user's account, while a task's description, written by
anyone who can open an issue on a public repo, is the agent's first prompt, and the task queue
(decision 047) starts such agents unattended. Instructions planted in an issue could make an
agent read a secret and post it as a comment, with nobody asked.

**Decision.**

- **One source of truth.** `src/main/mcp/toolAccess.ts` declares every "dugout" tool as `read`
  (list/get tasks, list/get/search context), `propose` (`add_note`, which only creates a proposal
  a person approves, decision 050) or `write` (the four task writes). A unit test fails if the
  server offers a tool that is not declared there, so a new tool cannot be pre-approved by
  accident; `write` is never pre-approved.
- **Claude:** `permissions.allow` lists each read and propose tool as `mcp__dugout__<tool>`; writes
  go through Claude Code's normal permission prompt (and Dugout's Needs you / inbox).
- **Codex** had no pre-approval: Dugout sets no approval mode for the server, and Codex's default
  (`auto`) asks for any MCP tool not marked read-only. The tools now carry MCP annotations from the
  same declaration (`readOnlyHint` for reads; `add_note` is not destructive and stays inside
  Dugout; writes reach outside it), so Codex runs reads and `add_note` without asking and still
  asks before writes. No new `-c` keys: older Codex versions reject unknown MCP config fields.
- **OpenCode** allowed every tool by default. Its inline config now adds permission rules
  `"dugout_*": "ask"`, then `"allow"` for each read and propose tool (OpenCode names MCP tools
  `<server>_<tool>` and the last matching rule wins), checked against OpenCode's source (Oct 2026).
- **The first prompt** wraps the description in `<task-description>` … `</task-description>`,
  after one sentence saying it was written by whoever filed the task and is data, not
  instructions. A closing tag inside the description is defused so it cannot end the block early.
  This lowers the odds an agent follows planted text; the permission prompt is what enforces it.

## 059 — A hook token per terminal; no tokens in MCP configs (2026-10-09)

**Context.** The hook server took a terminal id from the request path (`/hooks/<id>/<signal>`,
`/rpc/<id>`) and checked only one bearer token, minted once per launch and given to every agent:
in its env, in the on-disk MCP config `<userData>/mcp/<id>.json`, in `OPENCODE_CONFIG_CONTENT`
and, for Codex, in a `-c` override that ends up in its command line. Any agent could call
`/rpc/<another id>` and read or write that terminal's project tasks and context, or spoof its
status (issue #62; in scope per `SECURITY.md`). The `mcp` folder was created with the default
mode, and the socket was `chmod`ed only after `listen()`.

**Decision.**

- **A token per terminal.** `agentHooks/hookTokens.ts` (`HookTokens`) mints 32 random bytes for
  each agent terminal when `TerminalManager` launches it and keeps them only in main's memory.
  The hook server reads the terminal id from the path first and accepts the request only if its
  `Authorization` header is that terminal's token (`timingSafeEqual`); anything else is 401,
  including paths without a terminal id. The token is revoked when the terminal exits, and when a
  worktree setup fails and the agent never starts. Shells get none.
- **The token lives only in the agent's env** (`DUGOUT_HOOK_TOKEN`). Hook commands already read it
  from there. The "dugout" MCP server inherits it from the agent instead of having it written into
  its config: `McpServerEntry.inheritedEnv` names it, and no adapter puts it in a file, a config
  string or an argument. Checked per CLI (Oct 2026): Claude Code passes its whole env to stdio
  servers (probed with 2.1.295), OpenCode spreads `process.env` into local servers (its
  `mcp/index.ts`), and Codex passes only a few defaults, so its `mcp_servers.dugout` override
  forwards the token by name with `env_vars`, the key project servers already use (decision 022).
  The token therefore no longer appears in Codex's command line, where other users could read it.
- **Owner-only folders.** The socket is created inside `<userData>/hooks/` (0700, tightened if it
  existed; a symlink there is refused), or a fresh `mkdtemp` folder in the temp dir when that path
  is too long for a Unix socket, removed on quit. No other user can reach the socket even before
  its 0600 `chmod`, which stays. `<userData>/mcp/` is 0700 too, with 0600 files that now hold no
  secret.

The e2e fake Codex now gives the MCP server only `PATH`, `HOME` and its `env_vars`, as Codex does,
so a missing forward fails the Codex task test. Same-user processes can still read each other's
environments; see `docs/known-issues.md`.

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
7. **Done since:** "Day game" light theme with activity rail ✅, Review diff stats ✅, Seti
   file icons ✅, VS Code-style Source Control ✅, branch picker ✅, app icon and logo ✅.
8. **Done since:** start screen with a default agent and resumable sessions ✅, welcome screen
   with local and GitHub repos and an agent CLI check ✅, projects named after their folder ✅,
   fetch from Source Control ✅.
9. **Done since:** Agents list in the sidebar ✅, with each agent's subagents ✅, readable
   terminals and visible dividers ✅, leaner task tools for agents (search, priority, related,
   batch create) ✅, icons for the rail and icon buttons ✅.
10. **Done since:** the inbox shows pending tool calls in full and jumps straight to the agent ✅,
    with approvals tracked per tool call ✅.
11. **Done since:** "Open in…" VS Code, Cursor, Zed or Finder for projects and worktrees ✅.
12. **Done since:** one-click MCP server presets in Agent settings ✅.
13. **Done since:** task cards with markdown, and tasks open in an editor tab ✅.
14. **Done since:** review comments from the Review and Compare diffs, sent to the agent as one
    prompt ✅.
15. **Done since:** warnings when parallel agents change the same files ✅.
16. **Done since:** agent CLIs behind adapters with capabilities ✅, OpenCode ✅.
17. **Done since:** preview deployment URLs and per-worktree dev servers in the git panel ✅.
18. **Done since:** PR review comments and failing CI handed to the agent from the Pull request
    block ✅.
19. **Done since:** Verify on Stop: the project's check runs when an agent finishes ✅.
20. **Done since:** Linear as a task source, chosen per project ✅.
21. **Done since:** worktree setup (copy local files, run a setup command) ✅.
22. **Done since:** token usage per agent, task and project, with context-window use ✅.
23. **Done since:** project context agents read over MCP, with agent-proposed notes you approve
    and a headless codemap ✅.
24. **Done since:** session timelines from Claude and Codex transcripts ✅.
25. **Done since:** a task queue that starts the next task when an agent slot frees up ✅.
26. **Done since:** agents ask before writing to tasks; only read and propose tools are
    pre-approved ✅.
27. **Done since:** each agent terminal gets its own hook token, kept out of MCP configs ✅.
28. **Next:** more agents (Gemini CLI, Cursor CLI, Amp, …), one adapter each (#38).
