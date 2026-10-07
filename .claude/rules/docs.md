# Keeping the docs current

The docs are how the next session (human or agent) learns the codebase. A change is not done
until they match it. Check this list before every commit:

| When a change…                                                           | Update                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| adds or renames a feature folder, service, IPC domain or build script    | the Layout section of `.claude/CLAUDE.md`                     |
| introduces a trap someone will fall into (an ordering, an env var, …)    | Gotchas in `.claude/CLAUDE.md`                                |
| changes how a rule in `.claude/rules/*.md` works, or needs a new rule    | that rule file (add `paths:` frontmatter if it is scoped)     |
| makes a product or architecture decision, or ships a user-facing feature | a new numbered entry in `docs/decisions.md`, plus the Roadmap |
| finds, accepts or fixes a limitation                                     | `docs/known-issues.md`                                        |
| changes words users see (e.g. "agent", "project")                        | the "Words on screen" gotcha, and e2e selectors               |

- Update the docs in the same commit as the code, not afterwards.
- Docs describe what is true now. Remove or correct stale lines rather than adding new ones
  next to them, and keep `.claude/CLAUDE.md` short: link to a rule or decision for detail.
- If nothing in the table applies, say so in the summary to the user ("docs: no change needed").
