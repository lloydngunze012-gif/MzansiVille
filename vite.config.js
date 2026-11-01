import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Which build this is (in every error report): the commit and when it was built.
let commit = 'dev'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout */ }
const BUILD = `${commit} ${new Date().toISOString().slice(0, 16)}`

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  server: { port: 5173, host: true, watch: { ignored: ['**/docs/**', '**/test-results/**'] } },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 400,
  },
})
