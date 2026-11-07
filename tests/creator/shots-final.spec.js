// Screenshots for QA (docs/sprints/creator-studio/, not committed): the Organt tee front and
// three-quarter (female, male), the new framing at 390x844, and the cast's hair colours on campus.
import { test } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/creator-studio'
const at = (page, angle, tol = 0.07) => page.waitForFunction(([a, tol]) => { const s = window.mzansiStudio(); const d = ((s.angle - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < tol && s.mode === 'auto' }, [angle, tol], { timeout: 30000, polling: 16 })

test('creator: Organt tee and framing', async ({ browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  for (const gender of ['female', 'male']) {
    await page.locator(`[data-gender="${gender}"]`).first().tap()
    await page.waitForTimeout(600)
    const o = page.locator('[data-part="outfit"][data-id="organt"]')
    await o.scrollIntoViewIfNeeded(); await o.tap()
    await page.waitForFunction(() => window.mzansiStudio().mode === 'auto', null, { timeout: 15000 })
    await page.waitForTimeout(800)
    await at(page, 0.0001, 0.08)
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100)
    await page.screenshot({ path: `${OUT}/final-${gender}-organt-front.png` })
    await at(page, 0.42, 0.07)
    await page.screenshot({ path: `${OUT}/final-${gender}-organt-threequarter.png` })
  }
  await ctx.close()
})

test('framing, fresh creator, female and male (full phone screen)', async ({ browser }) => {
  test.setTimeout(240000)
  for (const [gender, name] of [['female', 'framing-female'], ['male', 'framing-male']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto('/?morning=0#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?morning=0#/new')
    await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
    if (gender === 'male') { await page.locator('[data-gender="male"]').first().tap(); await page.waitForTimeout(2500) }
    await at(page, 0.0001, 0.1)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    await ctx.close()
  }
})

