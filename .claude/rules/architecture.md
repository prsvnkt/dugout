# Architecture rules

## Process boundaries

- **main** is the only place that touches the OS: PTYs, git, files, dialogs, secrets.
- **renderer** is untrusted UI. It reaches main only through `window.dugout` (via `@renderer/lib/dugout`).
- **preload** only maps `DugoutApi` methods to IPC calls. No logic, no npm imports.
- **shared** holds types, channel names and zod schemas used by both sides. It must not import
  Node, Electron, React or DOM APIs (enforced by ESLint).

## Adding a capability (e.g. git status)

1. Types and request schemas in `src/shared/` (schemas in `ipc/contract.ts`, channel names in `ipc/channels.ts`).
2. Extend `DugoutApi` in `src/shared/api.ts`.
3. Domain logic in `src/main/services/<domain>/`, behind an interface when it wraps a process or
   library, with its dependencies injected so it is unit-testable without Electron.
4. A thin `src/main/ipc/register<Domain>Ipc.ts` that validates payloads and calls the service.
5. Map the methods in `src/preload/index.ts`.
6. UI in `src/renderer/src/features/<domain>/`.

## Design rules

- Keep services free of Electron imports where possible; IPC handlers are the adapter layer.
- Prefer small files (<400 lines) and functions (<50 lines), organised by feature.
- Model state as discriminated unions (see `TerminalStatus`) rather than loose flags.
- No speculative abstractions: an interface exists when there is a second implementation or
  a test seam that needs it (e.g. `TerminalBackend` for node-pty now, tmux later).
