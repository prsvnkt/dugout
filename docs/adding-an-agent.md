# Adding an agent

The checklist for a new agent CLI (Gemini CLI, Cursor CLI, Amp, …). Each agent is an
`AgentAdapter` (decision 037): the adapter only translates (command line, config, hook format);
status rules, the inbox, worktrees, tasks and resume stay shared. Outside the adapter folder,
`agents/registry.ts` and `shared/agents.ts`, no code branches on an agent's kind; it reads
capabilities. Use the three existing adapters as models:

| Agent    | Folder (`src/main/services/agents/`) | Status from                                 | Dugout's MCP server                  |
| -------- | ------------------------------------ | ------------------------------------------- | ------------------------------------ |
| Claude   | `claude/`                            | hooks in a settings file (`--settings`)     | a per-terminal `--mcp-config` file   |
| Codex    | `codex/`                             | the same hooks as `-c` config overrides     | a `-c mcp_servers.dugout=…` override |
| OpenCode | `opencode/`                          | a status plugin (`OPENCODE_CONFIG_CONTENT`) | inline config, with permission rules |

Check the CLI's own docs and source for every flag and config layer you rely on, and note the
version and date in the decision.

## 1. Describe it in `src/shared/agents.ts`

- Add its id to `AGENT_KINDS`. Ids are saved in layouts, settings and task worktree names, so
  pick one and never change it.
- Add its `AgentInfo` to `AGENTS`: `label` (menus, lists, inbox: "Claude"), `productName` (its
  terminal header: "Claude Code"), `cliName` (the welcome screen's agent check),
  `installCommand`, and `instructionsFiles` (the project instruction files it reads, preferred
  first).
- Set its `capabilities` honestly; the UI hides what an agent cannot do:
  - `hasStatus`: ready / working / needs you / done from hooks or a plugin. Without it the agent
    only shows "Running"; status never comes from scraping output (decision 008).
  - `hasMcp`: it gets the "dugout" MCP server, so it is offered on tasks.
  - `canResume`: it can continue a session by id after a restart.
  - `hasUsage` / `hasTimeline`: Dugout can read token usage (decision 046) and a session
    timeline (decision 048) from its transcripts. A timeline needs usage too.
  - `canRunHeadless`: it has a one-shot mode Dugout can run (the codemap, decision 050).
  - `projectMcp` (decision 061): `native` if the CLI loads `.mcp.json` itself and asks before
    running its servers, `via-dugout` if Dugout must pass them, `none` if it does not get them.
  - `needsMcpApproval` (decision 057): true when Dugout passes `.mcp.json` servers and the CLI
    does not ask before running them; the servers then wait for the user's approval in Dugout.

## 2. Write the adapter in `src/main/services/agents/<kind>/`

`<kind>Adapter.ts` exports an `AgentAdapter` (`agents/AgentAdapter.ts`) with:

- `info: AGENTS.<kind>`, `defaultCommand` (the CLI on PATH) and `commandVariable`
  (`DUGOUT_<KIND>_COMMAND`, which replaces the command; tests point it at a fake, and a packaged
  app ignores it, decision 060). `devOverrides.ts` reads it through the registry.
- `launch(context)`: the command line, run by `$SHELL -l -i -c`, made **only of plain `"$VAR"`
  expansions** (decision 013), plus the variables it reads in `env`. Start it with
  `"$DUGOUT_<KIND>_COMMAND"`; resume only when `context.isResuming` (from
  `$DUGOUT_RESUME_SESSION`) and send the first prompt only when `context.hasInitialPrompt` (from
  `$DUGOUT_INITIAL_PROMPT`), placed so a prompt starting with `-` stays a prompt (after `--`, or
  as `--prompt=`). `TerminalManager` adds the shared variables (`DUGOUT_TERMINAL_ID`, the hook
  socket and the terminal's hook token, decision 059). Return `dispose` if it writes
  per-terminal files.
- **Status** (if `hasStatus`): either hooks that post Dugout's signals to the hook socket (reuse
  `agentHooks/hookSettings.ts`: `HOOK_BINDINGS`, `signalCommand`; hook commands stay async,
  time-limited, silent and `|| true`), or a plugin that posts Claude-shaped payloads
  (`opencode/statusPlugin.ts`). Never edit the user's own config folder: use a session flag, an
  env var or an inline layer the CLI merges over the user's config. Never bypass the CLI's own
  trust prompts. Static files go in `prepare(dataDir)`, written when Dugout starts.
- **Dugout's MCP server** (if `hasMcp`): turn `context.mcp.server` (`McpServerEntry` from
  `agents/dugoutMcp.ts`) into the CLI's MCP config. The hook token is never written to a file, a
  config string or an argument: if the CLI does not pass its whole environment to stdio
  servers, forward `server.inheritedEnv` by name (as Codex does with `env_vars`).
- **Tool approval** (decision 053): pre-approve only `PRE_APPROVED_TOOLS` from
  `mcp/toolAccess.ts`, in the CLI's own permission format (Claude: `permissions.allow`;
  OpenCode: `"dugout_*": "ask"`, then `allow` per tool; Codex: the tools' MCP annotations). Task
  writes must still prompt. See [mcp-tools.md](mcp-tools.md).
- `projectMcpSharing(server)`: present exactly when `projectMcp` is `via-dugout`; says whether
  Dugout can pass that `.mcp.json` server, and why not. With `needsMcpApproval`, `launch` passes
  the checkout's servers only when their hash matches `context.approvedProjectServers`, and
  otherwise returns them as `withheldServers` (see `codex/projectServers.ts`).
- `instructionsImport(path)`: present exactly when `instructionsFiles` leaves out `AGENTS.md`:
  the line that makes the agent's own file import it (Claude: `@AGENTS.md`).
- `usage` (exactly when `hasUsage`): `transcriptRoot` (its config folder, honouring its own
  variable such as `CLAUDE_CONFIG_DIR` / `CODEX_HOME`) and a parser in `services/transcripts/`.
  Usage comes from the transcript its hooks name, never from terminal output. Prices for its
  models go in `usage/prices.ts`, with the date.
- `timeline` (exactly when `hasTimeline`): `find` a session's transcript under the usage folder
  and `read` its steps (`transcripts/*Timeline.ts`).
- `headless(command)` (exactly when `canRunHeadless`): a plain `"$VAR"` line that answers
  `$DUGOUT_HEADLESS_PROMPT` on stdout and exits, without hooks or Dugout's tools.

If the CLI marks its child processes with environment variables (like `CLAUDECODE` or
`OPENCODE_PID`), strip them in `terminal/launchSpec.ts`, so an agent started from inside another
is not taken for its child session.

## 3. Register it

Add the adapter to `AGENT_ADAPTERS` in `src/main/services/agents/registry.ts`. Menus, the start
screen, "Start agent ▾", the welcome check, Agent settings and notifications are built from the
registry and `shared/agents.ts`; nothing else needs the new kind.

## 4. Test it

- `agents/adapters.contract.test.ts` runs every registered adapter: registration and command
  override, plain `"$VAR"`s it provides, resume and prompt only when asked, the task server only
  with MCP and cleaned up on dispose, no unapproved `.mcp.json` server on the command line, no
  pre-approved task write, and each optional member present exactly when its capability says
  so. Make it pass without special-casing the new kind (if its usage folder has its own
  variable, add that variable to the transcript-root test).
- `agents/shellCommandLines.contract.test.ts` checks launch and headless lines; add any other
  command line the adapter makes Dugout type into a shell.
- Unit tests beside the adapter (`<kind>Adapter.test.ts`) for its config format and any plugin.
- `renderer/src/agentNames.test.ts` picks up the new label, product and CLI names: keep them out
  of renderer code.
- E2E: add a fake CLI to `tests/e2e/helpers.ts` (`makeFake<Agent>()` through `writeFakeAgent`)
  that runs Dugout's real hooks or plugin and can call a dugout tool, and point
  `DUGOUT_<KIND>_COMMAND` at it in the tests. If the agent has usage, give `launchApp` a temp
  folder for its config variable, so tests never read the developer's real one.

## 5. Document it

- A numbered entry in `docs/decisions.md` (what was checked, against which version), and the
  Roadmap.
- A `docs/known-issues.md` entry for each capability it lacks (as OpenCode has for `.mcp.json`
  servers, token usage and timelines).
- `.claude/CLAUDE.md` if a folder or gotcha changes, and the agent list in the README.
