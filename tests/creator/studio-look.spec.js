// Screenshots of the studio for Lloyd (docs/sprints/creator-studio/, not committed). TAG=ours|ara etc.
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-studio'
const TAG = process.env.TAG || 'after'

// Hold the turn at an angle for a screenshot: wait until the turn passes it (the page is
// read, never steered).
async function at(page, angle, tol = 0.12) {
  await page.waitForFunction(([a, tol]) => { const s = window.mzansiStudio(); const d = ((s.angle - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return Math.abs(d) < tol && s.mode === 'auto' }, [angle, tol], { timeout: 30000, polling: 16 })
}

async function open(browser, size = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  await page.waitForTimeout(1500)
  return { ctx, page }
}
const pick = async (page, part, id) => { const b = page.locator(`[data-part="${part}"][data-id="${id}"]`); await b.scrollIntoViewIfNeeded(); await b.tap(); await page.waitForTimeout(600) }
const shot = async (page, name) => { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: 390, height: 410 } }) }

test('studio: female and male, front and three-quarter, Organt tee', async ({ browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  const { ctx, page } = await open(browser)
  for (const gender of ['female', 'male']) {
    await page.locator(`[data-gender="${gender}"]`).first().tap()
    await page.waitForTimeout(500)
    await pick(page, 'outfit', 'organt')
    await page.waitForFunction(() => window.mzansiStudio().mode === 'auto', null, { timeout: 15000 })
    await page.waitForTimeout(800)
    await at(page, 0.0001, 0.08)
    await shot(page, `studio-${TAG}-${gender}-front`)
    await at(page, 0.42, 0.07) // three-quarter
    await shot(page, `studio-${TAG}-${gender}-threequarter`)
  }
  await ctx.close()
})

test('studio: the blond, fair-skinned guy', async ({ browser }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  const { ctx, page } = await open(browser)
  await page.locator('[data-gender="male"]').first().tap()
  await page.waitForTimeout(500)
  await pick(page, 'skin', 'fair')
  await pick(page, 'hairColor', '#e0b85c')
  for (const hair of ['crop', 'curls']) {
    await pick(page, 'hair', hair)
    await page.waitForFunction(() => window.mzansiStudio().mode === 'auto', null, { timeout: 15000 })
    await page.waitForTimeout(800)
    await at(page, 0.0001, 0.08)
    await shot(page, `studio-${TAG}-blond-${hair}-front`)
    await at(page, 0.42, 0.07)
    await shot(page, `studio-${TAG}-blond-${hair}-threequarter`)
  }
  await ctx.close()
})
