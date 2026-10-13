---
paths:
  - 'src/main/**'
  - 'src/preload/**'
  - 'src/shared/**'
---

# IPC and Electron security

- `BrowserWindow` must keep `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
  Never weaken these to make something work; move the work into main instead.
- Every `ipcMain.handle`/`ipcMain.on` payload is validated with its zod schema via `parsePayload`
  before use. Treat the renderer like a remote client.
- Validate paths in main (absolute, exists, is a directory) before spawning or reading.
- Use `invoke`/`handle` for request-response and `send`/`on` for fire-and-forget input.
  Main → renderer events are sent only to the `WebContents` that owns the resource, and only if
  it is not destroyed.
- Resources created for a renderer (terminals, watchers) are released when that renderer
  reloads or is destroyed. No orphaned processes.
- Navigation and `window.open` are blocked; external `https://` links go to the system browser.
- Never log secrets or terminal input. Tokens, when added, go through Electron `safeStorage`.
- The hook socket accepts a request only with the token of the terminal named in its path
  (`agentHooks/hookTokens.ts`, decision 059). The socket and per-terminal MCP configs live in
  owner-only (0700) folders; files there are 0600.
- The renderer CSP in `src/renderer/index.html` stays strict (`script-src 'self'`).
