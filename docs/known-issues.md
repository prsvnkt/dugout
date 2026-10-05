# Known issues

Limitations we have accepted for now and intend to revisit. Remove an entry when it is fixed.

## Parallel tool calls can briefly hide "Needs you"

- **Area:** agent status (`src/main/services/agentHooks/hookSettings.ts`, `TerminalManager.applyHookSignal`)
- **Found:** 2026-10-05, while building agent status (decision 008)

**What happens:** within one Claude turn, if several tools run in parallel and only some need
approval, a `PostToolUse` from a tool that finished sends `working` and overwrites
`needs-input`, even though another tool is still waiting for approval. The pane, sidebar and
dock badge then stop showing "Needs you" until the next permission prompt.

**Why:** signals carry no tool identity. The status is simply the last signal received.

**Likely fix:** send the hook payload (stdin) with `PermissionRequest` and `PostToolUse`, and
track pending approvals by `tool_use_id` per terminal. Stay `needs-input` while any approval
is pending; `Stop` clears all of them. Add unit tests for the interleavings, and extend the
fake `claude` in `tests/e2e/helpers.ts` to emit tool ids.
