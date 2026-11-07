import { defineConfig } from '@playwright/test'

// Installing the game (owner, 7 Nov): runs on the BUILT game (the service worker is only
// registered there). tests/install/install.check.js builds it, serves it
// on 4173 the way vercel.json does, and plays a deploy. Screenshots: docs/sprints/install/.
// Run: npx playwright test --config playwright.install.config.js
export default defineConfig({
  testDir: 'tests/install',
  testMatch: '*.check.js',
  retries: 0,
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    // WebGL (software), so the creator's 3D preview and the campus load as on a phone.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
})
