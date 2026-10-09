---
paths:
  - 'src/**/*.test.ts'
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
- E2E tests in `tests/e2e/` launch the built app with Playwright's `_electron`. Stub native
  dialogs via `app.evaluate(({ dialog }) => …)`. Read terminal output from `dugout.terminal.onData`,
  because xterm renders to a canvas.
- E2E tests never run a real agent CLI (they need auth). Use plain shells, or the fakes in
  `tests/e2e/helpers.ts` (`makeFakeClaude` / `Codex` / `OpenCode`, via `DUGOUT_<AGENT>_COMMAND`),
  which run the generated hooks or the real OpenCode plugin.
- Coverage target is 80%+ for `src/main` and `src/shared` (`npm run test:coverage`).
