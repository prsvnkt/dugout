import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/main/index.ts', 'src/main/window.ts'],
    },
  },
})
