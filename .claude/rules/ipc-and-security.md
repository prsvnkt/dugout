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
- Never log secrets or terminal input. Stored secrets (the GitHub token, the Linear API key) are
  encrypted with Electron `safeStorage` and never leave main (decisions 015, 051).
- The hook socket accepts a request only with the token of the terminal named in its path
  (`agentHooks/hookTokens.ts`, decision 059). The socket, per-terminal MCP configs and hook
  header files live in owner-only (0700) folders; files there are 0600. Hook commands read the
  header from its file (`-H "@$DUGOUT_HOOK_HEADER"`), never the token on curl's argv (decision 063).
- The renderer CSP in `src/renderer/index.html` stays strict (`script-src 'self'`, `base-uri`,
  `form-action` and `frame-ancestors` all `'none'`). Permission requests are denied except
  `clipboard-sanitized-write`; `handleRequest` answers only the main frame.
- File bytes for viewers come only over the `dugout-file:` protocol (decision 067): the URL
  names a project and a repo-relative path, main resolves the checkout and reads through
  `FileService.openRead`, and only the media types in `shared/viewers.ts` are served. The CSP
  allows the scheme in `img-src`, `media-src` and `connect-src`, nowhere else.
