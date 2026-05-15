import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Vitest config for pure-logic unit tests.
//
// Scope: pure functions only — no Electron, no React rendering, no jsdom.
// Anything that needs `window`, the iRacing SDK, or IPC belongs in the manual
// test plan (`docs/test-plan.md`), not here.
//
// Why a standalone config (not the electron-vite one): electron-vite's config
// targets Electron's main/renderer bundles and assumes the Electron runtime.
// Tests run in plain Node, so a simple Vite/Vitest config keeps things fast
// and avoids electron-builder pulling in native modules during `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: 'default'
  }
})
