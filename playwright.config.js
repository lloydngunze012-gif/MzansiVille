import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    // The game stills its bobbing choices and pulsing buttons for players who ask for reduced motion; the tests are those players, so taps land on settled buttons.
    reducedMotion: 'reduce',
    deviceScaleFactor: 2,
    // WebGL in headless Chrome/Edge needs SwiftShader, or the 3D home never gets ready.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
