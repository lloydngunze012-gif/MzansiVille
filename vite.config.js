import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Which build this is (in every error report): the commit and when it was built.
let commit = 'dev'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout (Vercel's own build has no git) */ }
// A deploy from the PC names its commit: npx vercel deploy --prod --yes -b BUILD_COMMIT=$(git rev-parse --short HEAD)  (#/health and every error report show it)
if (process.env.BUILD_COMMIT) commit = process.env.BUILD_COMMIT
// BUILD_TAG (optional) tells two builds of one commit apart (tests/install: a deploy).
const BUILD = `${commit} ${new Date().toISOString().slice(0, 16)}${process.env.BUILD_TAG ? ` ${process.env.BUILD_TAG}` : ''}`

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  server: { port: 5173, host: true, watch: { ignored: ['**/docs/**', '**/test-results/**'] } },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 400,
  },
})
