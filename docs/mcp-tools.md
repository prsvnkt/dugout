# The "dugout" MCP tools

Every agent with `hasMcp` (Claude, Codex, OpenCode) gets Dugout's bundled MCP server, named
`dugout` (`src/main/mcp/`, built as `out/main/mcp.js`). The server holds no token and knows no
other project: each call goes over the private hook socket to `/rpc/<terminalId>` with that
terminal's hook token (decision 059), and main validates it again (`taskRpcSchemas`,
`contextRpcSchemas`) and scopes it to the project of the agent's terminal. Task calls use the
user's GitHub token or Linear API key in main; the agent never sees either (decisions 015, 051).

When it connects, the server sends one line of `instructions`: tasks and project context are
available, and `list_context` is worth calling early (decision 050).

## Access classes and approval

`src/main/mcp/toolAccess.ts` declares each tool `read`, `propose` or `write`. It is the only place
that decides what agents may call without asking (decision 053), and a unit test fails if the
server offers a tool that is not declared there.

| Class     | Pre-approved | Meaning                                                              |
| --------- | ------------ | -------------------------------------------------------------------- |
| `read`    | yes          | reads the project's tasks or context                                 |
| `propose` | yes          | creates a proposal that a person approves in Dugout; changes nothing |
| `write`   | **never**    | changes GitHub Issues or Linear under the user's account             |

How each agent applies it: Claude's hook settings list the read and propose tools in
`permissions.allow` as `mcp__dugout__<tool>`; Codex reads the tools' MCP annotations
(`readOnlyHint` for reads, `add_note` not destructive) and asks before the rest; OpenCode gets
`"dugout_*": "ask"`, then `allow` for each read and propose tool. Writes go through the agent's
normal permission prompt, which shows in Dugout as "Needs you".

## Tools

| Tool              | Class   | Pre-approved | Reads or writes                                 |
| ----------------- | ------- | ------------ | ----------------------------------------------- |
| `list_tasks`      | read    | yes          | reads GitHub Issues or Linear                   |
| `get_task`        | read    | yes          | reads one issue and its comments                |
| `create_task`     | write   | no           | creates an issue                                |
| `create_tasks`    | write   | no           | creates up to 20 issues                         |
| `update_task`     | write   | no           | changes an issue                                |
| `comment_on_task` | write   | no           | posts a comment on an issue                     |
| `list_context`    | read    | yes          | reads `.dugout/context/` and private entries    |
| `get_context`     | read    | yes          | reads one context entry                         |
| `search_context`  | read    | yes          | searches context entries                        |
| `add_note`        | propose | yes          | a proposal in app data, until a person approves |

Results are compact JSON; an error comes back as a tool error with a readable message.

### Tasks (`taskTools.ts`; main: `services/tasks/taskRpc.ts`)

The project's tasks come from its task source: the GitHub Issues of its `origin` repo, or a
Linear team (decision 051). A task is addressed by its `number` (123 for `#123` or for
`ENG-123`); results also carry its `key` as people write it.

- **`list_tasks`** `{ status?, search? }`: `{ covers, tasks }`, each task as number, key, title,
  status, priority, labels (without Dugout's `dugout:*` ones) and updatedAt; no descriptions.
  Covers open and closed tasks, every status, the 300 most recently updated (no pull requests),
  highest priority first. `status` is one of `todo`, `in-progress`, `in-review`, `done`; `search`
  (up to 200 characters) keeps tasks whose title or description contains every word, any case.
- **`get_task`** `{ number }`: the task with its description and comments.
- **`create_task`** `{ title, body?, labels?, priority?, related? }`: creates an issue and
  returns `{ number, key, url, status }`. `title` up to 256 characters, `body` up to 65,000;
  `labels` up to 10 names (missing ones are created); `priority` `high`, `medium` or `low`;
  `related` up to 20 task numbers, added as "Related: <key>" lines.
- **`create_tasks`** `{ tasks }`: 1 to 20 tasks shaped like `create_task`, created in order; if
  one fails, the error says which were already created.
- **`update_task`** `{ number, title?, body?, status?, priority?, addLabels?, removeLabels? }`,
  plus `related?`: returns `{ number, key, url, status }`. `priority: "none"` removes it. On GitHub,
  status and priority are `dugout:*` labels (Done closes the issue); on Linear, status moves the
  issue to a workflow state and priority is Linear's own (decision 051). Agents cannot set
  `dugout:*` labels directly.
- **`comment_on_task`** `{ number, body }`: posts a comment (up to 65,000 characters).

### Project context (`contextTools.ts`; main: `services/context/contextRpc.ts`)

Context works without GitHub sign-in. Shared entries are Markdown files in `.dugout/context/` at
the project's main checkout (agents in worktrees read the main checkout's); private entries and
proposals stay in Dugout's app data (decision 050).

- **`list_context`** `{}`: `{ entries, covers }`, an index of id, kind, title, scope (shared or
  private), path or link, and a `pin` flag when a pinned file changed or vanished; no bodies.
- **`get_context`** `{ id }`: one entry in full: its Markdown body, its path or link, and the
  source of an imported document or the agent that built the codemap.
- **`search_context`** `{ query }`: entries whose title, path, link or body contain every word
  (any case; query up to 200 characters), at most 20 hits, each with a snippet.
- **`add_note`** `{ title, body }`: proposes a note (title up to 200 characters, Markdown body up
  to 20,000). Dugout shows it in the Context tab; it becomes a shared note in
  `.dugout/context/` only when a person approves it. Agents never write entries directly.

## Adding a tool

Declare it in `toolAccess.ts` first (a `write` is never pre-approved), register it in
`taskTools.ts` or `contextTools.ts` with its annotations, validate it in main with a schema in
`shared/ipc/`, scope it to the caller's project, and add it to this page.
