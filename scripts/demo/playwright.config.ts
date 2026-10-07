import { defineConfig } from '@playwright/test'

/** Records the README demo (`npm run demo:gif`); kept apart from the e2e suite. */
export default defineConfig({
  testDir: '.',
  testMatch: 'recordDemo.spec.ts',
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
})
