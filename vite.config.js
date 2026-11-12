import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

// Which build this is (in every error report): the commit and when it was built.
// Where the commit comes from, first that has one: BUILD_COMMIT (our deploy command passes it), Vercel's own
// VERCEL_GIT_COMMIT_SHA (Vercel sets it from the git details the CLI sends with an upload, and keeps it for a
// Redeploy from the dashboard, which passes no BUILD_COMMIT), then git itself (a build on this PC), else 'dev'.
let commit = 'dev'
let from = 'none'
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); from = 'git' } catch { /* not a git checkout (Vercel's own build has no git) */ }
if (process.env.VERCEL_GIT_COMMIT_SHA) { commit = process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7); from = 'VERCEL_GIT_COMMIT_SHA' }
if (process.env.BUILD_COMMIT) { commit = process.env.BUILD_COMMIT; from = 'BUILD_COMMIT' }
console.log(`build commit: ${commit} (from ${from})`)
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
