<p align="center"><img src="resources/logo.svg" width="96" alt="Dugout logo"></p>

# Dugout

One desktop app for running and supervising coding agents across all your projects: coloured
projects, multiple real terminals per window, and a git panel for reviewing what the agents
changed.

Dugout runs each agent's own CLI in a real terminal, so any terminal-based agent works in a
shell pane. Claude Code and Codex are integrated today (live status, notifications, resumable
sessions, task tools); more agents will get the same support one by one.

## Getting started

Requires macOS and Node 22+, plus the CLI of each agent you want to run on your shell's PATH,
for example [Claude Code](https://docs.claude.com/en/docs/claude-code) or
[Codex](https://github.com/openai/codex).

```sh
npm install
npm run dev
```

## Install on your Mac

```sh
npm install
npm run dist
```

This builds `dist/Dugout-<version>-arm64.dmg` (and `dist/mac-arm64/Dugout.app`). Open the DMG
and drag Dugout to Applications. To update, pull and run `npm run dist` again.

The build is ad-hoc signed, not notarized: a copy you build yourself opens normally, but a
downloaded one needs right-click → Open the first time. `npm run dev` keeps its data in
`~/Library/Application Support/Dugout Dev`, apart from the installed app's `Dugout` folder, and
shows as "Dugout Dev" in the Dock.

## Scripts

- `npm run dev` — run with hot reload
- `npm run check` — typecheck, lint, format check, unit tests
- `npm run icons` — regenerate `resources/icon.png` and `icon.icns` from the SVGs
- `npm run test:e2e` — end-to-end tests against the built app
- `npm run build` — production build
- `npm run dist` — package the macOS app into `dist/`
- `npm run test:e2e:packaged` — run the e2e tests against the packaged app (after `dist`)

See [docs/decisions.md](docs/decisions.md) for design decisions and the roadmap, and
[.claude/CLAUDE.md](.claude/CLAUDE.md) for the codebase guide.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and report security issues
privately as described in [SECURITY.md](SECURITY.md). Everyone taking part is expected to follow
the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
