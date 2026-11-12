// The activity "DONE" card: icon tile, eyebrow, fun line, gain pills, cost chips, big win.
// Run: npx playwright test tests/e2e/result-card.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'
import { skipGame } from '../city.js'

const OUT = 'docs/sprints/result-card'
test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial', timeout: 120000 })

async function student(page) {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'leisure', minutes: 15 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

test('R1: study at the library ends on the new card, inside a 390 px phone', async ({ page }) => {
  await student(page)
  await page.goto('/?fast=1&morning=0&spawn=library#/place/library')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const study = page.locator('[data-act="do"][data-id="library_study"]')
  await expect(study).toBeVisible({ timeout: 15000 })
  await study.tap()
  await skipGame(page, 20000) // (job K: studying opens the focus moment first)
  const card = page.locator('.g-result.rc')
  await expect(card).toBeVisible({ timeout: 60000 })
  await expect(card.locator('.rc-tile svg')).toBeVisible()
  await expect(card.locator('.rc-eyebrow')).toContainText(/done|big win/i)
  await expect(card.locator('.rc-line')).not.toBeEmpty()
  await expect(card.locator('.rc-gain').first()).toBeVisible()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/card.png` })
  const box = await card.boundingBox()
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  const bar = await page.locator('.g-hud').first().boundingBox()
  expect(box.y).toBeGreaterThan(bar.y + bar.height - 1)
})
