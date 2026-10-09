# Known issues

Limitations we have accepted for now and intend to revisit. Remove an entry when it is fixed.

## Windowed lists need one fixed row height; other long lists are not windowed

- **Area:** `src/renderer/src/lib/useVirtualRows.ts`, `features/explorer/FileTree.tsx`
- **Found:** 2026-10-09, while windowing the explorer (decision 062)

**What happens:** `useVirtualRows` places row `i` at `i × rowHeight`, so every row must be the
same height (the explorer's 24px); a row that wraps or grows would overlap its neighbours. Find
in page (⌘F) only finds rows in the DOM, the window, not the whole tree. The Timeline, Usage,
task lists and the Agents list still render every item (fine at the sizes seen so far, #82).

**Likely fix:** measure rows (or adopt `@tanstack/react-virtual`) if a windowed list ever needs
variable heights; window the other lists with the same hook once one gets long.

## Project context: codemap only with Claude; stale pins show on reload

- **Area:** `src/main/services/context/`, `src/renderer/src/features/context/`
- **Found:** 2026-10-09, while building project context (decision 050)

**What happens:** "Build codemap" needs a headless mode in the default agent's adapter, and only
Claude's (`claude -p`) is wired up, so the button is hidden while Codex or OpenCode is the
default. A pinned file's "Changed since pinned" flag is computed when the Context tab loads or
changes (and on every agent call), not while the tab stays open. The codemap build shows no
progress for its up to 10 minutes, and an interactive shell banner would end up in its text.

**Likely fix:** add `headless` to the Codex (`codex exec`) and OpenCode (`opencode run`) adapters
once their stdout is checked to be the answer alone; refresh the tab with the existing change
polling; stream the build's output into the tab.

## Task descriptions reach agents; only task writes are gated

- **Area:** `src/main/mcp/toolAccess.ts`, `src/main/services/tasks/taskSession.ts`, agent adapters
- **Found:** 2026-10-09, in a security audit (decision 053)

**What happens:** Task writes now ask first, but a task's description (and, through `get_task`,
its comments) is still text from anyone who can file an issue, and it reaches the agent. The
delimiters around it only discourage an agent from obeying it. Whatever else the user has
pre-approved in their own agent config (shell commands, other MCP servers, Codex
`approval_policy = "never"` or a bypass flag) is outside Dugout's rules. Codex's gate relies on
its default `auto` approval mode reading the tools' annotations, and OpenCode's on a version that
accepts per-tool permission keys; older versions may run the writes without asking.

**Likely fix:** let a project mark task sources as trusted or not, and for untrusted ones start
queued agents only after a person has read the task; show the task's author on its card.

## OpenCode agents do not get the project's .mcp.json servers

- **Area:** `src/main/services/agents/opencode/`
- **Found:** 2026-10-09, while adding the OpenCode adapter (decision 037)

**What happens:** OpenCode gets Dugout's "dugout" task server and status plugin, but not the
servers in the project's `.mcp.json`, which Claude Code loads itself and Codex gets as overrides.
A user's own `OPENCODE_CONFIG_CONTENT`, if they set one, is replaced by Dugout's in its terminals.

**Likely fix:** translate `.mcp.json` servers into OpenCode `local` / `remote` entries (`${VAR}`
becomes `{env:VAR}`), show them in Agent settings per agent, and merge an inherited
`OPENCODE_CONFIG_CONTENT` instead of replacing it.

## Codex .mcp.json approval: one per project, from the main checkout, at start

- **Area:** `src/main/services/agentConfig/serverApproval.ts`, `agents/codex/projectServers.ts`,
  `src/renderer/src/features/agentConfig/`
- **Found:** 2026-10-09, while adding the approval (decision 057)

**What happens:** A project holds one approved hash, checked against the main checkout's
`.mcp.json`. A worktree whose `.mcp.json` differs (a branch that changed it, or an agent that
edited it) gets no servers, and approving from its pane's notice is refused, because the main
checkout's file is not the one shown; it can be used only once the main checkout has the same
servers. An approval reaches only agents started afterwards: running ones keep what they started
with until restarted, and a dismissed notice comes back only with a new agent. The approval covers
every server in the file, including ones Codex cannot run, so changing one of those asks again.
Whoever adds `.mcp.json` servers for OpenCode (the issue above) must decide whether it asks before
running them, and set `needsMcpApproval` if not.

**Likely fix:** approve per checkout (or keep a few hashes per project), and offer "Restart with
servers" on the notice once approved.

## Token usage: OpenCode, earlier sessions and long-context prices

- **Area:** `src/main/services/usage/`, `src/main/services/transcripts/`
- **Found:** 2026-10-09, while adding the usage tracker (decision 046)

**What happens:** OpenCode agents show no usage: it keeps messages in its own storage (JSON
files or SQLite, by version), not a transcript its plugin names. Usage counts only from when an
agent ran in Dugout; there is no one-time import of earlier sessions for a project's folder
("outside Dugout"). Costs use short-context list prices (Claude Haiku 5.5 over 100K prompt
tokens and OpenAI over 272K cost more) and Codex reports one running total per session, so its
cost is an estimate per session, not per call. After 120 days untouched, a transcript's dedupe
ids are forgotten; resuming such an old session would count its copied replies again.

**Likely fix:** an OpenCode reader on its plugin's `message.updated` events (they carry tokens and
cost); an "Import earlier sessions" action that reads a project's transcript folders once and
labels them; per-call Codex usage from `last_token_usage`.

## Session timelines: subagent steps, older task sessions, OpenCode

- **Area:** `src/main/services/transcripts/`, `src/renderer/src/features/timeline/`
- **Found:** 2026-10-09, while adding session timelines (decision 048)

**What happens:** a subagent shows as one step (its task, type and outcome), not the tools it
ran; Claude keeps those in sidechain lines or `subagents/agent-*.jsonl`. A task tab offers
timelines only for its open agents and the last 5 closed sessions its project remembers.
OpenCode agents have no timeline (no transcript file). Codex's scripted `exec` tool is shown by
the first line of its script, and Codex subagents have no type. Very long sessions show only
their latest 1,500 steps.

**Likely fix:** expand a subagent step into its own transcript; list a task's sessions from the
usage ledger (it records session and task); an OpenCode reader on its plugin's message events.

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

**Debugging a failure:** since 2026-10-09 `playwright.config.ts` keeps a trace (`trace.zip`, open
with `npx playwright show-trace`) and a screenshot of each window for every failing test, in its
folder under `test-results/`, which CI uploads on failure.

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

**Mitigated:** the Release workflow runs `npm run check` before building, so a tag on a broken
commit fails instead of shipping, and attaches a `SHA256SUMS` file that the README tells users
to check the download against (decision 055). Checksums only show the file matches the release;
they do not replace a signature.

**Likely fix:** with a Developer ID, enable `hardenedRuntime` with entitlements (node-pty and
the Node-mode MCP server need `cs.allow-jit` / `cs.disable-library-validation`), add
`notarize`, add an `x64` or `universal` target, and use `electron-updater` with GitHub Releases.
Then set fuses (`EnableNodeCliInspectArguments=false`, `OnlyLoadAppFromAsar`, embedded asar
integrity, `GrantFileProtocolExtraPrivileges=false`; `RunAsNode` stays on for the MCP server),
as tracked in issue #65.

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

## Terminals: WebGL cap within one project, flow control counts characters

- **Area:** `src/renderer/src/features/terminal/` (decision 056)
- **Found:** 2026-10-09, while gating WebGL on visibility (#79, #80)

**What happens:** only the visible project's panes hold a WebGL context, so a single project with
more than ~16 panes would still have Chromium drop the oldest context (that pane then uses the
DOM renderer until its project is hidden and shown again). Flow control counts UTF-16 characters
rather than bytes, so its 1 MB / 256 KB marks are approximate for non-ASCII output.

**Likely fix:** an LRU cap on contexts if projects with that many panes become common; encode
lengths if the approximation ever matters.

## Linear tasks: one workspace, no comment counts on cards

- **Area:** Linear task source (`src/main/services/linear/`, decision 051)
- **Found:** 2026-10-09, while building decision 051

**What happens:** Dugout keeps one Linear API key, so every Linear project uses the same
workspace. Task cards show no comment count for Linear (lists skip comments to keep Linear's
query complexity low); the task tab shows them. A Linear issue moved to another team gets a new
identifier and leaves the project's list, and agents started on it keep the old key. "Closes
ENG-123" in a pull request closes the issue only when the Linear GitHub integration is installed.

**Likely fix:** a key per project if anyone needs two workspaces; fetch comment counts lazily for
visible cards; follow moved issues by their UUID.

## Dependency overrides need manual upkeep

- **Area:** `package.json` `overrides`
- **Found:** 2026-10-09, in the repo audit (#85)

**What happens:** `dompurify` is overridden to 3.4.16 because `monaco-editor@0.57.0` pins 3.4.15
(advisory). Dependabot does not bump `overrides`, so a pin can outlive its reason unnoticed. A
`global-agent` override (drops a vulnerable `sprintf-js`) is pending #33.

**Likely fix:** drop the `dompurify` override once monaco depends on a version past 3.4.15; check
`npm ls dompurify` on every monaco upgrade, and the same for `global-agent` once #33 lands.

## README demo GIF is 9.7 MB

- **Area:** `docs/media/demo.gif`
- **Found:** 2026-10-09, in the repo audit (#85)

**What happens:** the edited README demo is 9,727,926 bytes, against the ~2 MB that
`scripts/demo/makeGif.sh` expects. Every clone downloads it, and each new cut adds another copy
to the history.

**Likely fix:** re-encode the existing file in place with gifsicle (`-O3 --lossy=80 --colors 128`)
or an ffmpeg palette pass at the same size and frame rate, or host it as a release asset.

## Git panel push skips pre-push hooks; repo http settings and filters still apply

- **Area:** `src/main/services/git/` (decision 054)
- **Found:** 2026-10-09, while hardening Dugout-run git

**What happens:** Push and "Create PR" run no repository hooks, so a `pre-push` check
(and Git LFS's `pre-push`, which uploads LFS objects) does not run; push from a terminal in
an LFS repo. A remote's custom `uploadpack` / `receivepack` (e.g. git installed elsewhere on an
SSH server) is ignored. A repo's own `.git/config` can still set `http.proxy` with
`http.sslVerify=false` or its own `http.sslCAInfo`, which could intercept the token on push or
fetch to GitHub. Clean/smudge filters and diff textconv drivers named in `.git/config` still run
during status and diffs (Git LFS needs them).

**Likely fix:** run Git LFS's upload (`git lfs pre-push`) without the token in its env, or ask
before pushing when the repo has a `pre-push` hook; for push and fetch, override `http.*` for the
GitHub host from Dugout's side (repo config can name a longer URL, so `-c` alone is not enough).
