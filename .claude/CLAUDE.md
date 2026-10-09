# Dugout

A macOS desktop app for running and supervising many coding agents (Claude Code, Codex) across
projects, in one window. Electron + React + TypeScript, with real terminals (node-pty + xterm.js).

## Product principles

- **Wrap the agent CLIs, never reinvent them.** Sessions run the real `claude` or `codex` CLI in
  a real PTY, with the user's own config, auth and slash commands. No Agent SDK, no custom chat
  UI. More agents may follow, so UI text never assumes Claude (e.g. the start screen's prompt box
  goes to the user's default agent).
- **Organisation and supervision are the product:** projects, colours, split terminals,
  status, and a git panel for reviewing what agents changed.
- **Git integration is for review, not a git client.** Branch, changed files, diff,
  stage/commit/push, worktrees. Claude does the complex git work itself.
- One project = one repo. Keep it that simple.

See @docs/decisions.md for the decisions behind this and the roadmap.
Accepted limitations to revisit are in `docs/known-issues.md`; update it when fixing or finding one.

## Commands

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Run the app with hot reload                    |
| `npm run check`    | Typecheck + lint + format check + unit tests   |
| `npm test`         | Unit tests (Vitest)                            |
| `npm run test:e2e` | Build, then drive the real app with Playwright |
| `npm run build`    | Typecheck and production build into `out/`     |
| `npm run dist`     | Package the macOS app (DMG, zip) into `dist/`  |
| `npm run demo:gif` | Record raw demo footage (`scripts/demo/`)      |

**Definition of done:** `npm run check` and `npm run test:e2e` both pass, and the docs are
updated as `.claude/rules/docs.md` describes. CI (`.github/workflows/ci.yml`) runs both checks on
macOS for every push to `main` and every pull request.

## Layout

```
src/
  main/       Electron main process (Node). Owns PTYs, git, filesystem, dialogs.
    ipc/        One register*Ipc.ts per domain. Validates every payload with zod.
    services/   Domain logic, framework-light and unit-tested: terminal/, projects/,
                git/ (review panel, PR URLs), agentHooks/ (Claude + Codex status, pending approvals,
                subagents, session ids),
                worktrees/ (isolated sessions), workspace/ (saved layouts), notifications/,
                files/ (explorer + editor file access, path-safe), github/ (sign-in, API),
                settings/ (app preferences: default agent, clone folder, last "Open in…" app),
                openIn/ (open a checkout in VS Code, Cursor, Zed or Finder),
                tasks/ (GitHub Issues as tasks),
                agentConfig/ (.mcp.json servers, AGENTS.md / CLAUDE.md instructions),
                welcome/ (first-run repo search, agent CLI check).
    mcp/        The "dugout" MCP server agents use for tasks (separate build entry: mcp.js).
    menu.ts     Native menu; owns all keyboard shortcuts and sends AppCommands to the renderer.
  preload/    Sandboxed bridge. Exposes the typed `DugoutApi` as `window.dugout`. Nothing else.
  shared/     Runtime-agnostic types, IPC channel names and schemas. No Node/Electron/DOM imports.
  renderer/   React UI. Organised by feature: src/features/<feature>/, shared bits in src/lib/.
              Layout: project tabs (title bar) / Explorer over Agents | editor over terminals |
              Git panel; side panels collapse via workspace/SidePanel.tsx, and the Agents list
              (agents/) minimises down to its header (workspace/LeftSidebar.tsx).
              The right panel's Tasks view (tasks/) lists task cards; a task opens as an editor
              tab (kind `task`), rendered with tasks/markdown/ (safe markdown, no raw HTML).
              A project with no agents open shows start/StartScreen.tsx (prompt box, sessions to
              resume, open tasks); with no projects at all, welcome/WelcomeScreen.tsx (repos to
              add, agent check).
              State lives in small Zustand stores per feature (projectsStore, workspaceStore);
              pure state transitions (e.g. workspace/layout.ts) are unit-tested.
tests/e2e/    Playwright tests against the built Electron app.
scripts/demo/ Records raw demo footage (out/demo/demo.gif): sample repos, scripted agents, frames.
              The README GIF (docs/media/demo.gif) is edited from it by hand; never overwrite it.
docs/         Decisions and design notes.
```

Process boundaries, IPC and security rules live in `.claude/rules/`.

## Gotchas

- **Words on screen:** Claude/Codex terminals are **agents**, plain terminals are **shells**, and
  repos are **projects**. "Pane" is only a code name (`Pane`, `addPane`); never show it in the UI.
- **Dev app name and data:** `postinstall` renames `node_modules/electron/dist/Electron.app` to
  "Dugout Dev" (and re-signs it ad hoc), and unpackaged runs keep their data in "Dugout Dev", so
  `npm run dev` is never confused with the installed app. If the Dock says "Electron" again after
  an Electron upgrade, run `npm install`.
- **The preload is sandboxed:** it cannot `require` npm packages. Import only dependency-free
  modules into it (e.g. `@shared/ipc/channels`, never `@shared/ipc/contract`, which pulls zod).
- **node-pty `spawn-helper`** can install without its executable bit; `postinstall` fixes it.
  If spawning fails with `posix_spawnp failed`, run `npm install` again.
- **Electron downloads its binary lazily** (on first run, not on install). `postinstall` runs
  `install-electron` first, so parallel e2e workers do not race the download and the dev bundle
  exists for `brand-dev-electron.mjs` to rename "Dugout Dev".
- **Terminal env:** `buildTerminalEnv` strips Electron and parent-agent variables
  (`CLAUDECODE`, `CLAUDE_CODE_*`, …). Without that, launching the app from inside Claude Code
  makes every embedded `claude` think it is a child session.
- **Hidden workspaces use `visibility: hidden`, never `display: none`.** A 0×0 container makes
  xterm fit to 2 columns and garbles the Claude TUI. `useTerminal` also skips fitting when hidden.
- **Request-response IPC returns `Result<T>`** (`handleRequest` in main, `unwrap` in renderer)
  so errors reach the UI as readable messages.
- **Agent status comes only from hooks** (see decision 008). E2E tests use the fake `claude`
  from `tests/e2e/helpers.ts` via `DUGOUT_CLAUDE_COMMAND`; never scrape terminal output.
- **All git commands go through `GitService`/`runGit`** so they inherit the no-lock, no-prompt,
  literal-pathspec environment (decision 009). Never call `git` from elsewhere.
- **Shell command lines use only plain `"$VAR"` expansions** (decision 013). `${VAR:+…}` splits
  differently in zsh and bash and does not exist in fish.
- **Store updates that change nothing must return the same object.** Panes report values from
  effects; returning a new object for an unchanged value causes an infinite render loop.
- **Monaco loads lazily** (`features/editor/monaco/`). The eager editor store talks to it only
  through `editorBridge`; never import `monaco-editor` outside that folder.
- **All file access goes through `FileService`**, which realpaths every path and refuses
  anything outside the checkout (symlinks included).
- **The GitHub token never leaves main** (decision 015). Renderer-facing types must not carry it;
  e2e tests assert this. Network git commands go through `GitService.runNetwork`.
- **Agents reach Dugout only through the MCP server → hook socket RPC**, scoped to their
  terminal's project. Never put tokens in MCP configs or tool results.
- **Tests never touch real app data:** set `DUGOUT_USER_DATA_DIR` and `DUGOUT_HOME_DIR` (the
  welcome screen searches the home folder for repos); the e2e helpers set both. Tests that click
  "Open in…" set `DUGOUT_OPEN_COMMAND` to a fake `open`, so no real app launches.
- **Pinned versions:** Vite 7 (electron-vite 5 does not support Vite 8) and TypeScript 5.9
  (typescript-eslint does not support TS 7 yet). Check peers before upgrading.
