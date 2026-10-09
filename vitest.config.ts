import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** The project's coverage target (`.claude/rules/testing.md`). */
const COVERAGE_TARGET = { statements: 80, branches: 75, functions: 75, lines: 80 }

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // A short summary in the log; the full HTML report goes to coverage/ (uploaded by CI).
      reporter: ['text-summary', 'html', 'json-summary'],
      // Renderer logic (stores, pure transitions, helpers) only. React views (*.tsx) are left out:
      // they are covered by the Playwright e2e suite, and counting them would make the floor
      // meaningless (about 47% statements with them, at the time of the coverage audit).
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts', 'src/renderer/src/**/*.ts'],
      exclude: [
        '**/*.test.*',
        '**/*.testSupport.ts',
        '**/*.d.ts',
        // Electron entry points and native wiring, exercised by the e2e suite.
        'src/main/index.ts',
        'src/main/window.ts',
        'src/main/menu.ts',
        'src/main/appIcon.ts',
        'src/main/mcp/server.ts',
      ],
      // A floor CI enforces (`npm run check`); raise it as tests land, never lower it.
      thresholds: {
        // TODO(coverage audit, 2026-10): untested renderer logic (stores, hooks, helpers measured
        // about 26%) holds the whole-codebase total at 62.8 / 64.8 / 56.9 / 65.0% (statements /
        // branches / functions / lines). This is measured minus one; raise it toward 80 / 75 / 75 /
        // 80 as renderer tests land.
        statements: 61,
        branches: 63,
        functions: 55,
        lines: 64,
        // Main and shared already meet the target, so hold them to it.
        'src/main/**': COVERAGE_TARGET,
        'src/shared/**': COVERAGE_TARGET,
      },
    },
  },
})
