# Contributing to Dugout

Thanks for your interest! Dugout is a small project, so the process is light.

## Before you start

- **Bugs:** open an issue with steps to reproduce, your macOS version and Dugout version.
- **Features:** open an issue to discuss it first. Dugout deliberately wraps each agent's real CLI
  (Claude Code, Codex, …) rather than reinventing it, and keeps git to review (not a full git client). See the
  product principles in [.claude/CLAUDE.md](.claude/CLAUDE.md) and the decisions in
  [docs/decisions.md](docs/decisions.md).
- **Security issues:** do not open a public issue. See [SECURITY.md](SECURITY.md).

## Setup

Requires macOS, Node 24 (see `.nvmrc`) and git.

```sh
npm install
npm run dev
```

`npm run dev` keeps its data in `~/Library/Application Support/Dugout Dev`, separate from an
installed copy of Dugout.

## Making a change

1. Branch from `main` (`feat/…`, `fix/…`).
2. Read [.claude/CLAUDE.md](.claude/CLAUDE.md) (layout and gotchas) and the rules in
   [.claude/rules/](.claude/rules/). They apply to human and AI contributors alike.
3. Write the test first. Unit tests sit next to the code as `*.test.ts`; end-to-end tests live
   in `tests/e2e/` and never run the real `claude` (they use a fake from `tests/e2e/helpers.ts`).
4. Keep the docs current in the same commit (see [.claude/rules/docs.md](.claude/rules/docs.md)).

**Done means both pass:**

```sh
npm run check      # typecheck, lint, format check, unit tests
npm run test:e2e   # build, then drive the real app with Playwright
```

## Commits and pull requests

- Commit messages follow `<type>: <description>`, where type is one of `feat`, `fix`,
  `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- Keep pull requests focused on one change, and fill in the template.
- CI runs both checks on macOS; a pull request is merged once they pass and it is reviewed.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE)
and that you will follow the [Code of Conduct](CODE_OF_CONDUCT.md).
