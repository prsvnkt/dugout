---
paths:
  - 'src/main/services/terminal/**'
  - 'src/renderer/src/features/terminal/**'
---

# Terminal rules

- Terminals run the user's login shell (`$SHELL -l`, and `-l -i -c claude` for Claude) so PATH and
  profile match their normal terminal. Never hardcode a path to `claude`.
- All spawning goes through `TerminalManager` → `TerminalBackend`. The renderer never chooses
  the executable or arguments, only a `TerminalKind` and a `cwd`.
- Environment changes go in `buildTerminalEnv` with a unit test. It must not mutate its input.
- `TerminalBackend` is the seam for a future tmux-backed implementation; keep it minimal.
- In the renderer, `useTerminal` owns one xterm + one PTY. Its cleanup must kill the PTY and
  dispose xterm. Handle the create-resolves-after-unmount race (React StrictMode mounts twice).
- Session status (running / waiting / done) will come from Claude Code hooks passed via
  `claude --settings`, never from scraping terminal output, and never by editing `~/.claude`.
