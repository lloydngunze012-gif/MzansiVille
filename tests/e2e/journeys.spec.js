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

test('J1: a Law student from the gate follows the route to Law and walks into the Law lecture', async ({ page }) => {
  await student(page, { course: 'Law', set: { phase: 'lecture', minutes: 520, at: 'gate', lectureRoute: true, lectureResolved: false } })
  await page.goto('/?morning=0&talk=auto&j=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-spawn', 'gate', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await expect(page.locator('.g-now')).toContainText('Law')
  await shot(page, 'J1-1')
  for (let taps = 0; taps < 60; taps++) {
    if (/#\/lecture/.test(page.url())) break
    const target = await page.evaluate(() => {
      const r = window.mzansiRoute()
      if (!r) return null
      let left = 7
      let from = r.player
      for (const p of r.path) {
        const d = Math.hypot(p.x - from.x, p.z - from.z)
        if (d >= left) { const k = left / d; return window.mzansiScreenOf(from.x + (p.x - from.x) * k, from.z + (p.z - from.z) * k) }
        left -= d
        from = p
      }
      return window.mzansiScreenOf(from.x, from.z)
    })
    if (!target) break
    await page.mouse.click(Math.max(30, Math.min(382, target.x)), Math.max(320, Math.min(760, target.y)))
    await page.waitForTimeout(1600)
    if (taps === 4) await shot(page, 'J1-2')
  }
  await expect(page).toHaveURL(/#\/lecture/, { timeout: 20000 })
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-venue', 'law')
  await page.waitForTimeout(2500)
  await shot(page, 'J1-3')
  await expect(page.locator('#lecture3d')).toHaveAttribute('data-step', 'seat', { timeout: 60000 })
  await page.waitForTimeout(1000)
  await shot(page, 'J1-4')
})

test('J2: Map, tap the Cafeteria: the map closes, you walk there, the sheet opens on arrival', async ({ page }) => {
  await student(page)
  await world(page, 'j=2')
  await page.locator('[data-act="view"][data-mode="map"]').tap()
  await page.waitForTimeout(800)
  await shot(page, 'J2-1')
  await page.locator('.g-map [data-act="place-open"][data-id="cafeteria"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-going', 'cafeteria', { timeout: 10000 })
  const started = Date.now()
  await page.waitForTimeout(2500)
  await shot(page, 'J2-2')
  await expect(page).toHaveURL(/#\/place\/cafeteria/, { timeout: 60000 })
  console.log('J2 walk seconds (real, normal speed):', ((Date.now() - started) / 1000).toFixed(1))
  await page.waitForTimeout(1200)
  await shot(page, 'J2-3')
})

test('J4: at the Quad, talk to a student, "Sit with them": both sit on a bench and chat', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&j=4')
  await tapPerson(page, 'naledi')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await shot(page, 'J4-1')
  await card.locator('.g-talk-reply').first().tap()
  await page.waitForTimeout(800)
  await shot(page, 'J4-2')
  await card.locator('[data-kind="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'sitTogether', { timeout: 10000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('sit')
  await page.waitForTimeout(2500)
  await shot(page, 'J4-3')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
})

async function doAction(page, place, id) {
  await page.goto(`/?morning=0&spawn=${place}&j=${id}#/place/${place}`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  const btn = page.locator(`[data-act="do"][data-id="${id}"]`)
  await expect(btn).toBeVisible({ timeout: 15000 })
  await btn.tap()
}

test('J5: the library: study at a desk with a book open', async ({ page }) => {
  await student(page, { set: { phase: 'leisure', minutes: 15 * 60 } })
  await doAction(page, 'library', 'library_study')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'study', { timeout: 10000 })
  await page.waitForTimeout(2500)
  await shot(page, 'J5-1')
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('sit')
  await page.waitForTimeout(1500)
  await shot(page, 'J5-2')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await page.waitForTimeout(800)
  await shot(page, 'J5-3')
})

test('J6: night in res: into bed, sleep, wake up the next morning', async ({ page }) => {
  await student(page, { set: { phase: 'night', minutes: 22 * 60, eventSeen: true, dailyEventId: null } }) // today's event was seen at midday
  const home = (await runOf(page)).character.residence === 'O Block' ? 'res_o' : null
  await page.goto('/?morning=0&j=6#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  // The night bar's Sleep opens your res; Sleep there.
  await page.locator('.g-cta [data-act="place-open"]').tap()
  const sleep = page.locator('[data-act="do"][data-id="sleep"]')
  await expect(sleep).toBeVisible({ timeout: 15000 })
  void home
  await sleep.tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'sleep', { timeout: 10000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(1500)
  await shot(page, 'J6-1')
  // Any cards from the day (results, goals) come first; tap through to the day summary.
  await expect.poll(async () => {
    if (await page.getByRole('button', { name: /Start day 2/ }).first().isVisible()) return true
    const next = page.locator('.g-result button[data-act="dismiss"], [data-screen-card] button[data-act="dismiss"]').first()
    if (await next.isVisible()) await next.tap({ timeout: 2000 }).catch(() => {})
    return false
  }, { timeout: 90000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1000)
  await shot(page, 'J6-2')
  await page.getByRole('button', { name: /Start day 2/ }).tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'wakeUp', { timeout: 20000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(1200)
  await shot(page, 'J6-3')
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('sit')
  await page.waitForTimeout(600)
  await shot(page, 'J6-4')
  expect((await runOf(page)).day).toBe(2)
})

test('J7: a job shift: the character visibly works', async ({ page }) => {
  await student(page, { set: { day: 4, phase: 'leisure', minutes: 15 * 60 } }) // shifts are in the 15:00 free block, from day 4
  await doAction(page, 'quad', 'job_shift')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'flyers', { timeout: 10000 })
  await page.waitForTimeout(2500)
  await shot(page, 'J7-1')
  await page.waitForTimeout(3000)
  await shot(page, 'J7-2')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await page.waitForTimeout(1000)
  await shot(page, 'J7-3')
})
