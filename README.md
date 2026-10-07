<p align="center"><img src="resources/logo.svg" width="96" alt="Dugout logo"></p>

# Dugout

One desktop app for running and supervising Claude Code sessions across all your projects:
coloured projects, multiple real terminals per window, and a git panel for reviewing what the
agents changed.

## Getting started

Requires macOS, Node 22+ and the [Claude Code CLI](https://docs.claude.com/en/docs/claude-code)
on your shell's PATH.

```sh
npm install
npm run dev
```

## Scripts

- `npm run dev` — run with hot reload
- `npm run check` — typecheck, lint, format check, unit tests
- `npm run icons` — regenerate `resources/icon.png` and `icon.icns` from the SVGs
- `npm run test:e2e` — end-to-end tests against the built app
- `npm run build` — production build

See [docs/decisions.md](docs/decisions.md) for design decisions and the roadmap, and
[.claude/CLAUDE.md](.claude/CLAUDE.md) for the codebase guide.
