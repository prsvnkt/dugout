# Dugout

A macOS desktop app for running and supervising many Claude Code sessions across projects,
in one window. Electron + React + TypeScript, with real terminals (node-pty + xterm.js).

## Product principles

- **Wrap Claude Code, never reinvent it.** Sessions run the real `claude` CLI in a real PTY,
  with the user's own config, auth and slash commands. No Agent SDK, no custom chat UI.
- **Organisation and supervision are the product:** projects, colours, split terminals,
  status, and a git panel for reviewing what agents changed.
- **Git integration is for review, not a git client.** Branch, changed files, diff,
  stage/commit/push, worktrees. Claude does the complex git work itself.
- One project = one repo. Keep it that simple.

See @docs/decisions.md for the decisions behind this and the roadmap.

## Commands

| Command            | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Run the app with hot reload                    |
| `npm run check`    | Typecheck + lint + format check + unit tests   |
| `npm test`         | Unit tests (Vitest)                            |
| `npm run test:e2e` | Build, then drive the real app with Playwright |
| `npm run build`    | Typecheck and production build into `out/`     |

**Definition of done:** `npm run check` and `npm run test:e2e` both pass.

## Layout

```
src/
  main/       Electron main process (Node). Owns PTYs, git, filesystem, dialogs.
    ipc/        One register*Ipc.ts per domain. Validates every payload with zod.
    services/   Domain logic, framework-light and unit-tested (terminal/, later git/, projects/).
  preload/    Sandboxed bridge. Exposes the typed `DugoutApi` as `window.dugout`. Nothing else.
  shared/     Runtime-agnostic types, IPC channel names and schemas. No Node/Electron/DOM imports.
  renderer/   React UI. Organised by feature: src/features/<feature>/, shared bits in src/lib/.
tests/e2e/    Playwright tests against the built Electron app.
docs/         Decisions and design notes.
```

Process boundaries, IPC and security rules live in `.claude/rules/`.

## Gotchas

- **The preload is sandboxed:** it cannot `require` npm packages. Import only dependency-free
  modules into it (e.g. `@shared/ipc/channels`, never `@shared/ipc/contract`, which pulls zod).
- **node-pty `spawn-helper`** can install without its executable bit; `postinstall` fixes it.
  If spawning fails with `posix_spawnp failed`, run `npm install` again.
- **Terminal env:** `buildTerminalEnv` strips Electron and parent-agent variables
  (`CLAUDECODE`, `CLAUDE_CODE_*`, …). Without that, launching the app from inside Claude Code
  makes every embedded `claude` think it is a child session.
- **Pinned versions:** Vite 7 (electron-vite 5 does not support Vite 8) and TypeScript 5.9
  (typescript-eslint does not support TS 7 yet). Check peers before upgrading.
