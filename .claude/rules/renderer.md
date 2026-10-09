---
paths:
  - 'src/renderer/**'
---

# Renderer rules

- Organise by feature: `src/features/<feature>/` holds its components, hooks, styles and tests.
- Styling: CSS Modules per component, colours/spacing/fonts only from `styles/tokens.css`.
  No hardcoded hex values in components; add a token instead.
- Inside a project, the UI `--accent` is that project's colour; the logo's brand colours
  (`--field*`, `--chalk`, `--clay`, `--logo-*`) belong to the welcome screen only (decision 028).
  Status must never rely on colour alone; pair it with text or an icon.
- Icons: Lucide, through `<Icon icon={…} />` from `@renderer/lib/Icon` (decision 035), with
  named imports from `lucide-react`. Never text glyphs (`+`, `×`, `»`, `⌄`) as button icons.
- Talk to main only through `dugout` from `@renderer/lib/dugout`. Never use `window.dugout` directly.
- Components stay presentational where possible; side effects live in `use*` hooks with cleanup.
- Async loads go through `lib/useRequest` (loading / loaded / failed, late results ignored);
  no hand-rolled `isCancelled` + `.then(result => …)` effects.
- Show user-friendly errors in the UI; log details with `console.warn`/`console.error` only.
- Keyboard first: every action should be reachable without the mouse, with visible focus.
- An ARIA widget role (`tablist`, `tree`, `menu`, `dialog`) promises its WAI-ARIA APG keyboard
  pattern: implement it or drop the role (decision 058). Use `useArrowNavigation` / `useMenuKeys`
  from `@renderer/lib/useArrowNavigation` (roving focus, Arrow keys, Home/End), pass the trigger
  to `useDismiss` so focus returns to it, and use a native `<dialog>` with `showModal()` for modals.
- Text uses `--text-primary`, `--text-secondary` or `--text-muted` (all at least 4.5:1);
  `--text-faint` is for decorative glyphs only. Animations need a `prefers-reduced-motion` rule.
