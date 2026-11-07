import { defineConfig } from '@playwright/test'

// The Soft Life website (site/): builds it and serves the build, then tests/site/site.check.js
// checks every width, tap target, image, link and the page weight, and takes the screenshots
// (docs/sprints/website/, not committed). Run: npx playwright test --config playwright.site.config.js
export default defineConfig({
  testDir: 'tests/site',
  testMatch: '*.check.js',
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4180', channel: 'msedge' },
  webServer: {
    command: 'npm --prefix site run build && npm --prefix site run preview',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: true,
    timeout: 60000,
  },
})
