import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      rollupOptions: {
        // mcp.js: the "dugout" MCP server Claude Code starts for each terminal.
        input: { index: resolve('src/main/index.ts'), mcp: resolve('src/main/mcp/server.ts') },
      },
    },
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      // Sandboxed preload scripts must be CommonJS.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: {
      alias: { ...sharedAlias, '@renderer': resolve('src/renderer/src') },
    },
    plugins: [react()],
    // Packaging (decision 052): electron-vite leaves every bundle unminified. Minify the
    // renderer, the bulk of the app (Monaco, xterm, React). Main and preload stay readable:
    // they are small, and their stack traces land in logs and bug reports as they are. No
    // sourcemaps: there is no crash-reporting pipeline to symbolicate them yet.
    build: { minify: 'esbuild' },
  },
})
