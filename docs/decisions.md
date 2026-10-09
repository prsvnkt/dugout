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
socket (mode 0600) with a per-launch bearer token; the terminal id, socket, token and settings
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
