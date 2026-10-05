---
paths:
  - 'src/renderer/**'
---

# Renderer rules

- Organise by feature: `src/features/<feature>/` holds its components, hooks, styles and tests.
- Styling: CSS Modules per component, colours/spacing/fonts only from `styles/tokens.css`.
  No hardcoded hex values in components; add a token instead.
- Project colours (teal, orange, purple, blue) identify projects. Status must never rely on colour
  alone; pair it with text or an icon.
- Talk to main only through `dugout` from `@renderer/lib/dugout`. Never use `window.dugout` directly.
- Components stay presentational where possible; side effects live in `use*` hooks with cleanup.
- Show user-friendly errors in the UI; log details with `console.warn`/`console.error` only.
- Keyboard first: every action should be reachable without the mouse, with visible focus.
