// Makes public/creator-still.png: the default student on the studio stage, front, on a transparent
// background, at the stage's size on a 390x844 phone. Opt-in: STILL=1 npx playwright test tests/creator/still.spec.js --config playwright.gpu.config.js
import { test } from '@playwright/test'
test('creator still', async ({ browser }) => {
  test.skip(!process.env.STILL, 'opt-in')
  test.setTimeout(120000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  await page.addStyleTag({ content: '*:not(canvas){background:transparent!important;box-shadow:none!important}.cc-stage{border:0!important}.cc-stage::before,.cc-stage::after{content:none!important}.cc-still,.cc-mute{display:none!important}' })
  await page.waitForFunction(() => { const s = window.mzansiStudio(); const d = ((s.angle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < 0.03 && s.mode === 'auto' }, null, { timeout: 30000, polling: 8 })
  await page.locator('.cc-stage').screenshot({ path: 'public/creator-still.png', omitBackground: true })
})
