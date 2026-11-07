// Design directions for the creator (?cc=a|b|c) and today's, at 390x844, real GPU: female and male.
// Screenshots: docs/sprints/creator-redesign/ (not committed).
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-redesign'
const front = (page) => page.waitForFunction(() => { const s = window.mzansiStudio?.(); if (!s) return false; const d = ((s.angle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < 0.12 && s.mode === 'auto' }, null, { timeout: 30000, polling: 16 })
for (const cc of ['today', 'a', 'b', 'c']) {
  test(`direction ${cc}`, async ({ browser }) => {
    test.setTimeout(120000)
    fs.mkdirSync(OUT, { recursive: true })
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const q = cc === 'today' ? '' : `&cc=${cc}`
    await page.goto(`/?morning=0${q}#/new`)
    await page.evaluate(() => localStorage.clear())
    await page.goto(`/?morning=0${q}#/new`)
    await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
    await page.waitForTimeout(1500)
    await front(page)
    await page.screenshot({ path: `${OUT}/dir-${cc}-female.png` })
    await page.locator('[data-gender="male"]').first().tap()
    await page.waitForTimeout(600)
    const o = page.locator('[data-part="outfit"][data-id="organt"]')
    await o.scrollIntoViewIfNeeded(); await o.tap()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollTo(0, 220))
    await page.waitForFunction(() => window.mzansiStudio().mode === 'hold', null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/dir-${cc}-male.png` })
    await ctx.close()
  })
}
