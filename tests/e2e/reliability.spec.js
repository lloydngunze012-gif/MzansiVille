// Reliability: the game never gets stuck on an empty field. An activity that breaks
// off inside a room puts you back on campus; a hot reload mid-play comes back with
// the campus; the watchdog brings back a lost player; a broken scene shows the reload
// card (the save kept); errors land in the error log with where they happened.
// npx playwright test tests/e2e/reliability.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { campus } from './motion-helpers.js'

const OUT = 'docs/sprints/reliability'
test.use({ viewport: { width: 412, height: 915 } })
test.describe.configure({ timeout: 300000 })

const onMap = (p) => p && Math.abs(p.x) < 108 && Math.abs(p.z) < 108
const errors = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.errors') || '[]'))
const ready = async (page) => {
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect.poll(() => page.evaluate(() => (window.mzansiColliders?.() || []).length), { timeout: 60000 }).toBeGreaterThan(20)
}

test('R1 an activity that breaks off inside a room: back on campus, reported', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await campus(page, 'quad', '&a=23')
  // Let's study: into the library room; the first wait in there breaks.
  await page.evaluate(() => window.mzansiTalkTo('x12'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.evaluate(() => { window.mzansiFailNextWait = true })
  await card.locator('[data-kind="study"]').tap()
  await expect.poll(() => page.evaluate(() => document.getElementById('world').dataset.activityStep), { timeout: 120000 }).toBe('done')
  await page.waitForTimeout(1500)
  const p = await page.evaluate(() => window.mzansiPlayerPos())
  const fade = await page.evaluate(() => !document.querySelector('.scene-fade')?.hidden)
  const log = await errors(page)
  await page.screenshot({ path: `${OUT}/R1-back-on-campus.png` })
  console.log('after the broken activity', JSON.stringify({ p, fade, log: log.slice(0, 1) }))
  expect(onMap(p), 'on the campus map').toBe(true)
  expect(fade, 'no black fade left').toBe(false)
  expect(log.some((e) => e.kind === 'activity' && /broke off/.test(e.message) && e.screen && e.device && e.build)).toBe(true)
})

test('R2 a hot reload mid-play (the dev server): the campus comes back', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await campus(page, 'quad')
  await ready(page)
  // Touch a game file the way an edit does, then put it back.
  const file = 'src/world/crowd.js'
  const before = fs.readFileSync(file, 'utf8')
  fs.writeFileSync(file, before + '\n// reload test\n')
  await page.waitForTimeout(4000)
  fs.writeFileSync(file, before)
  await page.waitForTimeout(4000)
  await ready(page)
  await page.waitForTimeout(2000)
  const p = await page.evaluate(() => window.mzansiPlayerPos())
  const built = await page.evaluate(() => ({ people: window.mzansiBodies('campus').length, colliders: window.mzansiColliders().length, failCard: Boolean(document.querySelector('.world-fail')) }))
  await page.screenshot({ path: `${OUT}/R2-after-hot-reload.png` })
  console.log('after a hot reload', JSON.stringify({ p, built }))
  expect(onMap(p)).toBe(true)
  expect(built.people).toBeGreaterThan(10)
  expect(built.failCard).toBe(false)
})

test('R3 the watchdog: a player lost off the map is put back at the nearest place', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await campus(page, 'quad')
  await ready(page)
  await page.evaluate(() => window.mzansiPlace(0, -300, 0, -301))
  await page.screenshot({ path: `${OUT}/R3-1-lost.png` })
  await expect.poll(async () => onMap(await page.evaluate(() => window.mzansiPlayerPos())), { timeout: 15000 }).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/R3-2-back.png` })
  const log = await errors(page)
  console.log('watchdog', JSON.stringify(log.slice(0, 1)))
  expect(log.some((e) => e.kind === 'watchdog' && /outside the map/.test(e.message))).toBe(true)
})

test('R4 the scene itself fails: "Something went wrong. Tap to reload", the save kept', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await campus(page, 'quad')
  await ready(page)
  const saved = await page.evaluate(() => localStorage.getItem('mzansiville.v1'))
  await page.evaluate(() => window.mzansiBreakCampus())
  const fail = page.locator('.world-fail')
  await expect(fail).toBeVisible({ timeout: 15000 })
  await expect(fail).toContainText('Something went wrong')
  await page.screenshot({ path: `${OUT}/R4-1-reload-card.png` })
  await fail.locator('button').tap()
  await ready(page)
  const after = await page.evaluate(() => localStorage.getItem('mzansiville.v1'))
  await page.screenshot({ path: `${OUT}/R4-2-reloaded.png` })
  expect(JSON.parse(after).run.character.name).toBe(JSON.parse(saved).run.character.name)
  const log = await errors(page)
  expect(log.some((e) => e.kind === 'watchdog' && /campus is missing/.test(e.message))).toBe(true)
  // The error log screen shows it.
  await page.goto('/#/errors')
  const screen = page.locator('main[data-screen="errors"]').last()
  await expect(screen).toBeVisible()
  console.log('error log screen', (await screen.innerText()).slice(0, 300))
  await expect(screen).toContainText('campus is missing')
  await page.screenshot({ path: `${OUT}/R4-3-error-log.png` })
})
