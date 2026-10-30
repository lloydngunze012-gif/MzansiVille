import { defineConfig } from '@playwright/test'
import { GAME_DIR } from './lib/day1.mjs'
const PORT = process.env.QA_PORT || '5199'
export default defineConfig({
  testDir: '.', testMatch: /day1-(morning|lecture)\.spec\.js/, retries: 0, workers: 2, timeout: 240000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`, channel: 'msedge', deviceScaleFactor: 1, hasTouch: true,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [390, 360, 430].map((w) => ({ name: `w${w}`, use: { viewport: { width: w, height: 844 } } })),
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${PORT} --strictPort`, cwd: GAME_DIR, url: `http://127.0.0.1:${PORT}`, reuseExistingServer: false, timeout: 60000 },
})
