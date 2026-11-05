// The common-room and cafeteria rows added in 13d00e1 play an existing scene: one house
// activity (in your common room, from Things to do) and one cafeteria activity open,
// play out and close, and their result lands.
// Run: npx playwright test tests/e2e/new-activities.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/new-activities'
test.describe.configure({ mode: 'serial', timeout: 180000 })

async function student(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'morning', minutes: 8 * 60, money: 500, lectureResolved: true })
    save.run.stats.money = 500
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

async function plays(page, id) {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
  await page.locator(`[data-act="do"][data-id="${id}"]`).tap()
  const world = page.locator('#world')
  await expect(world).toHaveAttribute('data-activity', /.+/, { timeout: 15000 })
  const scene = await world.getAttribute('data-activity')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${id}.png` })
  await page.evaluate(() => { const w = document.querySelector('#world'); window.__steps = []; new MutationObserver(() => { const s = w.dataset.activityStep; if (window.__steps.at(-1) !== s) window.__steps.push(s) }).observe(w, { attributes: true }) })
  try { await expect(world).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 }) } finally { console.log(id, 'steps', JSON.stringify(await page.evaluate(() => window.__steps)), await page.evaluate(() => JSON.stringify({ q: window.mzansiQueue?.('counter'), q2: window.mzansiQueue?.('stall'), pos: window.mzansiPlayerPos?.() }))) ; await page.screenshot({ path: `${OUT}/${id}-end.png` }) }
  await page.waitForTimeout(800)
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats)
  console.log(id, JSON.stringify({ scene, before, after }))
  expect(after).not.toEqual(before)
  expect(errors).toEqual([])
}

test('house_noodles plays in the common room', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page)
  await page.goto('/?fast=1&morning=0#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await expect(page.locator('#world')).toHaveAttribute('data-house', /.+/, { timeout: 15000 })
  // (a story card the day opens with: Continue, as a player would)
  for (let i = 0; i < 4 && await page.locator('[role="dialog"] button:has-text("Continue")').isVisible().catch(() => false); i++) {
    await page.locator('[role="dialog"] button:has-text("Continue")').first().tap()
    await page.waitForTimeout(600)
  }
  await page.locator('.house-do').tap()
  await plays(page, 'house_noodles')
})

test('caf_coffee plays at the cafeteria', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page)
  await page.goto('/?fast=1&morning=0#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2000)
  for (let i = 0; i < 4 && await page.locator('[role="dialog"] button:has-text("Continue")').isVisible().catch(() => false); i++) {
    await page.locator('[role="dialog"] button:has-text("Continue")').first().tap()
    await page.waitForTimeout(600)
  }
  if (!(await page.locator('[data-act="do"][data-id="caf_coffee"]').isVisible().catch(() => false))) {
    await page.evaluate(() => { location.hash = '#/place/cafeteria' })
    await page.waitForTimeout(2500)
  }
  await plays(page, 'caf_coffee')
})
