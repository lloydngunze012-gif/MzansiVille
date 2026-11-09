// Before and after for the creator redesign (TAG=before|after), at 390x844 and 360x740, real GPU:
// the look step (female at the front; male in the Organt tee, scrolled), and the "who" step.
// Screenshots: docs/sprints/creator-redesign/ (not committed).
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-redesign'
const TAG = process.env.TAG || 'after'
const front = (page) => page.waitForFunction(() => { const s = window.mzansiStudio?.(); if (!s) return false; const d = ((s.angle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < 0.12 && s.mode === 'auto' }, null, { timeout: 30000, polling: 16 })
for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`${TAG} ${w}x${h}`, async ({ browser }) => {
    test.setTimeout(150000)
    fs.mkdirSync(OUT, { recursive: true })
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.goto('/?morning=0#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?morning=0#/new')
    await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
    await page.waitForTimeout(1200)
    await front(page)
    await page.screenshot({ path: `${OUT}/${TAG}-${w}-female.png` })
    await page.locator('[data-gender="male"]').first().tap()
    await page.waitForTimeout(500)
    const o = page.locator('[data-part="outfit"][data-id="organt"]')
    await o.scrollIntoViewIfNeeded(); await o.tap()
    await page.waitForFunction(() => window.mzansiStudio().mode === 'hold', null, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${TAG}-${w}-male.png` })
    await page.locator('[data-act="enrol-next"]').tap()
    await page.locator('.en[data-step="who"]').waitFor()
    await page.locator('[data-act="enrol-next"]').scrollIntoViewIfNeeded() // (the who step's last control: the old chips list is gone)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${TAG}-${w}-who.png` })
    await ctx.close()
  })
}
