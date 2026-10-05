import { defineConfig } from '@playwright/test'

/** Each test runs a full Electron app plus login shells, so cap parallelism. */
const MAX_WORKERS = 4
const TEST_TIMEOUT_MS = 60_000

export default defineConfig({
  testDir: './tests/e2e',
  timeout: TEST_TIMEOUT_MS,
  workers: MAX_WORKERS,
  // Retry once on CI only; locally a flake should stay visible.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
})
