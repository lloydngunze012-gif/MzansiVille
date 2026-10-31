// Actions sprint finish line (A1-A5): every reply leads to something you see,
// at phone size, by taps. Normal speed with screenshots in docs/sprints/actions/;
// FAST=1 runs the same checks at ?fast=1 without saving screenshots.
// Run: npx playwright test tests/e2e/actions.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/actions'
const FAST = Boolean(process.env.FAST)
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ timeout: FAST ? 120000 : 300000 })

const shot = (page, name) => (FAST ? null : page.screenshot({ path: `${OUT}/${name}.png` }))
const runOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
const q = (s) => `/?morning=0${FAST ? '&fast=1' : ''}&${s}`

async function student(page, set = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto(q('a=0#/new'))
  await page.evaluate(() => localStorage.clear())
  await page.goto(q('a=0#/new'))
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
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
  await page.goto(q(`${query}#/play`))
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(FAST ? 600 : 2000)
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


test('A1: "Walk away" ends the chat and the player walks off', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&a=1')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(FAST ? 300 : 1200)
  await shot(page, 'A1-1')
  const before = await page.evaluate(() => window.mzansiPlayerPos())
  await card.locator('[data-act="talk-bye"]').tap()
  await expect(card).toBeHidden()
  await expect(page.locator('#world')).not.toHaveAttribute('data-talking', /./)
  await page.waitForTimeout(FAST ? 150 : 700)
  await shot(page, 'A1-2')
  await expect(page.locator('#world')).toHaveAttribute('data-walk-away', 'done', { timeout: 15000 })
  const after = await page.evaluate(() => window.mzansiPlayerPos())
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(2)
  await page.waitForTimeout(FAST ? 100 : 600)
  await shot(page, 'A1-3')
})

test('A2: "Let\'s get something to eat": both walk to the caf, queue, buy, sit at one table and eat', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&a=2')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(FAST ? 300 : 1000)
  await shot(page, 'A2-1')
  const money = (await runOf(page)).stats.money
  await card.locator('[data-kind="eat"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-companion', 'x12')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'queueOrder', { timeout: 10000 })
  await page.waitForTimeout(FAST ? 600 : 4000)
  await shot(page, 'A2-2')
  // In the line, they stand right behind you.
  await expect(card).toBeVisible({ timeout: 90000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  const me = await page.evaluate(() => window.mzansiPlayerPos())
  const friend = await page.evaluate(() => window.mzansiCompanion())
  expect(friend.id).toBe('x12')
  expect(Math.hypot(friend.x - me.x, friend.z - me.z)).toBeLessThan(4)
  await card.locator('[data-item="pap"]').tap()
  expect((await runOf(page)).stats.money).toBe(money - 30)
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'orderEat', { timeout: 10000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await expect.poll(async () => page.evaluate(() => window.mzansiCompanion()?.pose), { timeout: 10000 }).toBe('sit')
  const seated = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiCompanion()])
  expect(Math.hypot(seated[0].x - seated[1].x, seated[0].z - seated[1].z)).toBeLessThan(2.5) // the same table
  await page.waitForTimeout(FAST ? 300 : 2500)
  await shot(page, 'A2-3')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await expect(page.locator('#world')).not.toHaveAttribute('data-companion', /./)
  const run = await runOf(page)
  expect(run.together[run.day]['eat:x12']).toBe(true)
  await page.waitForTimeout(FAST ? 100 : 1000)
  await shot(page, 'A2-4')
})

test('A3: "Let\'s study": both go to the library and study', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&a=3')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="study"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-companion', 'x12')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'groupStudy', { timeout: 10000 })
  await page.waitForTimeout(FAST ? 500 : 3500)
  await shot(page, 'A3-1')
  const walking = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiCompanion()])
  if (walking[1].visible) expect(Math.hypot(walking[0].x - walking[1].x, walking[0].z - walking[1].z)).toBeLessThan(4)
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(FAST ? 300 : 1500)
  await shot(page, 'A3-2')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  const run = await runOf(page)
  expect(run.together[run.day]['study:x12']).toBe(true)
  expect(run.at).toBe('library')
  await page.waitForTimeout(FAST ? 100 : 1000)
  await shot(page, 'A3-3')
})

test('A4: "Swap numbers": the contact appears in your phone', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&a=4')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  const name = (await card.locator('h2').textContent()).trim()
  await card.locator('[data-kind="swap"]').tap()
  await expect(card).toHaveAttribute('data-phase', 'swapped')
  await page.waitForTimeout(FAST ? 200 : 800)
  await shot(page, 'A4-1')
  await card.locator('[data-act="talk-phone"]').tap()
  await expect(page).toHaveURL(/#\/profile/)
  await expect(page.locator('.phone-card')).toContainText(name)
  await page.waitForTimeout(FAST ? 200 : 800)
  await shot(page, 'A4-2')
})

test('A5: tap Auntie Pinky from outside the line: back of the line, front, order, pay, sit and eat', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=cafeteria&a=5')
  const money = (await runOf(page)).stats.money
  await tapPerson(page, 'auntie_pinky')
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'queueOrder', { timeout: 10000 })
  await expect(page.locator('.act-say')).toContainText('Back of the line, baby!')
  await page.waitForTimeout(FAST ? 300 : 2500)
  await shot(page, 'A5-1')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 90000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await page.waitForTimeout(FAST ? 200 : 800)
  await shot(page, 'A5-2')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  expect((await runOf(page)).stats.money).toBe(money - 35)
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'orderEat', { timeout: 10000 })
  await expect.poll(async () => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(FAST ? 300 : 1800)
  await shot(page, 'A5-3')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await page.waitForTimeout(FAST ? 100 : 1000)
  await shot(page, 'A5-4')
})

// Reply buttons lead somewhere: a goodbye reply ends with one Bye that walks you off,
// an action reply starts the thing at once.
test('replies with an act: goodbye walks off, "Walk with me?" walks together', async ({ page }) => {
  await student(page)
  await world(page, 'spawn=quad&a=6')
  await page.evaluate(() => window.mzansiTalkTo('x12'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('.g-talk-reply').last().tap() // archetype replies end with a goodbye
  await expect(card).toHaveAttribute('data-phase', 'answer')
  await expect(card.locator('[data-act="talk-more"]')).toHaveCount(0)
  await card.locator('[data-act="talk-bye"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-walk-away', /walking|done/)
  await page.waitForTimeout(FAST ? 800 : 3000)
  await page.evaluate(() => window.mzansiTalkTo('x12'))
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="walk"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'walkTogether', { timeout: 10000 })
  await expect(page.locator('#world')).toHaveAttribute('data-companion', 'x12')
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  const run = await runOf(page)
  expect(run.together[run.day]['walk:x12']).toBe(true)
})
