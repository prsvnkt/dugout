import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

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
        'src/main/compose/**',
        'src/main/window.ts',
        'src/main/menu.ts',
        'src/main/appIcon.ts',
        'src/main/mcp/server.ts',
      ],
      // A floor CI enforces (`npm run check`): floor = measured − 2, rounded down (2026-10-14);
      // raise it when coverage rises, never lower it.
      thresholds: {
        statements: 90,
        branches: 84,
        functions: 87,
        lines: 92,
        'src/main/**': { statements: 92, branches: 85, functions: 92, lines: 94 },
        'src/shared/**': { statements: 98, branches: 93, functions: 98, lines: 98 },
        'src/renderer/src/**': { statements: 84, branches: 80, functions: 77, lines: 87 },
      },
    },
  },
})
