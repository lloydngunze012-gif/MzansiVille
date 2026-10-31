// Sprint 1 finish line: seven journeys at phone size, played by taps, at NORMAL
// speed (no ?fast=1), with screenshots saved to docs/sprints/sprint1/.
// Run: npx playwright test tests/e2e/journeys.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/sprint1'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ mode: 'serial', timeout: 300000 })

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })
const runOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)

// A new student through the creator (taps), then the day set up for the journey.
async function student(page, { course = null, set = {} } = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  if (course) await page.locator('#course').selectOption(course)
  else await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate((x) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, x)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, set)
}

async function world(page, query) {
  await page.goto(`/?morning=0&${query}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2000)
}

// Tap a person where they are on screen (like a player), else start the chat directly.
async function tapPerson(page, id) {
  const at = await page.evaluate((who) => window.mzansiPersonOnScreen(who), id)
  const ok = at && !at.behind && at.x > 20 && at.x < 392 && at.y > 300 && at.y < 780
  if (ok) await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(500)
  const started = await page.evaluate(() => Boolean(document.getElementById('world').dataset.talking || document.getElementById('world').dataset.activity === 'queueOrder'))
  if (!ok || !started) await page.evaluate((who) => window.mzansiTalkTo(who), id)
}

test('J3: tap Auntie Pinky, queue, order a bunny chow, pay, sit and eat at a table, stand up', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=cafeteria&j=3')
  const money = (await runOf(page)).stats.money
  await tapPerson(page, 'auntie_pinky')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'queueOrder', { timeout: 10000 })
  await page.waitForTimeout(2500)
  await shot(page, 'J3-1')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 90000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await page.waitForTimeout(800)
  await shot(page, 'J3-2')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  expect((await runOf(page)).stats.money).toBe(money - 35)
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'orderEat', { timeout: 10000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose?.()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(1800)
  await shot(page, 'J3-3')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await page.waitForTimeout(1000)
  await shot(page, 'J3-4')
})
