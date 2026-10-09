---
paths:
  - 'src/**/*.test.ts'
  - 'src/**/*.test.tsx'
  - 'vitest.config.ts'
  - 'playwright.config.ts'
  - 'tests/**'
  - 'src/main/services/**'
  - 'src/shared/**'
---

# Testing rules

- TDD: write the failing test first, see it fail, then implement.
- Unit tests sit next to the code as `*.test.ts` and run in Node with Vitest. Use the
  Arrange-Act-Assert structure and names that describe behaviour.
- Test services through their injected dependencies (see the `FakeProcess` backend in
  `TerminalManager.test.ts`). Do not mock Electron or node-pty modules globally.
- Renderer stores are tested in Node through `useX.getState()`: import
  `@renderer/lib/fakeDugout.testSupport` first (it installs a fake `window.dugout`), give each
  test the IPC methods it needs with `setFakeDugout`, reset stores with `setState(initial, true)`,
  and assert "nothing changed" with `toBe(before)`. No `vi.mock` of modules.
- E2E tests in `tests/e2e/` launch the built app with Playwright's `_electron`. Stub native
  dialogs via `app.evaluate(({ dialog }) => …)`. Read terminal output from `dugout.terminal.onData`,
  because xterm renders to a canvas.
- E2E tests never run a real agent CLI (they need auth). Use plain shells, or the fakes in
  `tests/e2e/helpers.ts` (`makeFakeClaude` / `Codex` / `OpenCode`, via `DUGOUT_<AGENT>_COMMAND`),
  which run the generated hooks or the real OpenCode plugin.
- Coverage target is 80% statements and lines, 75% branches and functions. `vitest.config.ts`
  `coverage.thresholds` enforces it for `src/main` and `src/shared`, and a lower whole-codebase
  floor (currently 61 / 63 / 55 / 64%) that includes renderer `.ts` logic; React views (`.tsx`)
  are left to e2e. `npm run check` (and so CI) fails below either. Raise the floor as tests land,
  never lower it. Unit tests may be `*.test.ts` or `*.test.tsx`.
- E2E: `launchApp` gives each app temp `CLAUDE_CONFIG_DIR` / `CODEX_HOME` folders. A failing
  test leaves a trace and screenshots in `test-results/`. Wait on state, never on time:
  e.g. `expect.poll(() => savedPanes(userDataDir))` for the debounced layout save. Commits use
  `GIT_IDENTITY` from `helpers.ts`.
