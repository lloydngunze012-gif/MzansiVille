import { test } from '@playwright/test'
const OUT = 'docs/sprints/creator-studio'
test('page', async ({ browser }) => {
  test.setTimeout(120000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  await page.waitForFunction(() => { const s = window.mzansiStudio(); const d = ((s.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < 0.1 }, null, { timeout: 30000, polling: 16 })
  await page.screenshot({ path: `${OUT}/page-top.png` })
  await page.evaluate(() => window.scrollTo(0, 99999))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/page-bottom.png` })
  await ctx.close()
})
