// Map = go there: a tap on a place (2D map or the in-world map) goes back to the
// 3D view, the student walks there, and the place sheet opens on arrival.
// "Skip there" jumps to the door and the clock moves on.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/map'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ mode: 'serial', timeout: 150000 })

async function newGame(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

test('2D map: tap the cafeteria, back in 3D you walk there and its sheet opens', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await newGame(page)
  await page.goto('/?fast=1&morning=0&m=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.locator('[data-act="view"][data-mode="map"]').tap()
  const pin = page.locator('.g-map [data-act="place-open"][data-id="cafeteria"]')
  await expect(pin).toBeVisible()
  await page.screenshot({ path: `${OUT}/1-map.png` })
  await pin.tap()
  await expect(page.locator('#world')).toHaveAttribute('data-going', 'cafeteria', { timeout: 10000 })
  await expect(page.locator('.go-skip')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/2-walking.png` })
  // Walking: closer to the cafeteria door every moment (the headless browser walks slowly, so then skip the rest).
  const gap = async () => page.evaluate(() => { const p = window.mzansiRoute().player; const d = window.mzansiDoorOf('cafeteria'); return Math.hypot(p.x - d.x, p.z - d.z) })
  const g0 = await gap()
  await page.waitForTimeout(3000)
  expect(await gap()).toBeLessThan(g0 - 1)
  await page.locator('.go-skip').tap()
  await expect(page).toHaveURL(/#\/place\/cafeteria/, { timeout: 15000 })
  await expect(page.locator('.go-skip')).toBeHidden()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/3-arrived.png` })
})

test('in-world map: tap the library, then Skip there: the clock moves and the sheet opens', async ({ page }) => {
  await newGame(page)
  await page.goto('/?fast=1&morning=0&m=2#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.evaluate(() => window.dispatchEvent(new Event('mzansi-open-map')))
  const pin = page.locator('.map-pin[data-place="library"]')
  await expect(pin).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/4a-world-map.png` })
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.minutes)
  await pin.tap({ timeout: 10000 })
  await expect(page.locator('.map-overlay')).toBeHidden()
  await page.locator('.go-skip').tap()
  await expect(page).toHaveURL(/#\/place\/library/, { timeout: 10000 })
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.minutes)
  expect(after).toBeGreaterThan(before)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/4-skipped.png` })
})
