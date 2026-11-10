// The compact top bar (owner, 10 Nov), at 390 px. One slim row (at most 8% of the screen):
// the time pill with the day inside, five stat icons with whole numbers, one menu button
// (leaderboard, chat, sound, settings) with a dot for anything new. A low stat is a solid
// red pill with white text that pulses gently (two low stats in step; still under reduced
// motion). The time pill opens the day's timeline, which closes itself after 4 s; the goal
// badge shows the goal text. During a chat the camera has both heads in plain view (never
// inside a sign or a roof). Screenshots in docs/sprints/topbar/ (not committed).
// Run: npx playwright test tests/e2e/topbar.spec.js --config playwright.edge.config.js --project quick
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'
import { atGate, intoCity } from '../city.js'

const OUT = 'docs/sprints/topbar'
const W = 390
const H = 844
test.use({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

// A student on the Quad at 13:00 with these stats (and anything else in run).
async function student(page, stats, extra = {}) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.evaluate(({ s, x }) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, x)
    Object.assign(save.run.stats, s)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, { s: stats, x: extra })
  await page.goto('/?fast=1&morning=0&spawn=quad&n=2#/play')
  await expect(page.locator('.tb-stats')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
}
const bar = (page) => page.evaluate(() => {
  const hud = document.querySelector('.g-hud').getBoundingClientRect()
  const row = document.querySelector('.tb-row')
  const kids = [...row.children].map((e) => ({ cls: e.className, top: e.getBoundingClientRect().top, bottom: e.getBoundingClientRect().bottom, right: e.getBoundingClientRect().right }))
  const stats = [...document.querySelectorAll('.tb-stat')].map((e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    return { k: e.dataset.k, band: e.dataset.band, text: e.querySelector('i').innerText, label: e.querySelector('b') ? e.querySelector('b').innerText : '', left: r.left, right: r.right, bg: cs.backgroundColor, color: getComputedStyle(e.querySelector('i')).color, anim: cs.animationName, dur: cs.animationDuration, delay: e.style.animationDelay }
  })
  return { height: hud.height, bottom: hud.bottom, kids, stats, time: document.querySelector('.tb-time').innerText, menu: document.querySelectorAll('.tb-row [data-act="gear"]').length, dot: Boolean(document.querySelector('.tb-menu .tb-dot')), extras: document.querySelectorAll('.g-hud a[href="#/board"], .g-hud a[href="#/chat"], .g-hud [data-act="sound"], .g-hud .g-phases').length }
})
const RED = 'rgb(212, 47, 37)'
const WHITE = 'rgb(255, 255, 255)'

test('B1 one slim row: time pill with the day, five whole-number stats, one menu with a dot; nothing else in the bar', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 86.7496, hunger: 70, grades: 55, social: 64 }, { inbox: [{ from: 'Zoe', text: 'Caf later?', read: true }], inboxSeen: 0 })
  const b = await bar(page)
  console.log(JSON.stringify({ height: b.height, time: b.time, stats: b.stats.map((s) => [s.k, s.text]) }))
  expect(b.height, 'at most 8% of the screen height').toBeLessThanOrEqual(H * 0.08)
  // one row: every child of the row shares the same band, nothing past the right edge
  const tops = b.kids.map((k) => k.top)
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(6)
  expect(Math.max(...b.kids.map((k) => k.right))).toBeLessThanOrEqual(W)
  expect(b.time).toMatch(/[A-Z]{3}\s*13:00/i)
  expect(b.stats.map((s) => s.k)).toEqual(['money', 'energy', 'hunger', 'grades', 'social'])
  for (const s of b.stats) expect(s.text, `${s.k} is a whole number`).toMatch(/^-?R?[\d\s ]+$|^R\d+(\.\d)?k$/)
  expect(b.stats.find((s) => s.k === 'energy').text).toBe('87')
  // stats sit side by side, none overlapping
  for (let i = 1; i < b.stats.length; i++) expect(b.stats[i].left).toBeGreaterThanOrEqual(b.stats[i - 1].right - 0.5)
  expect(b.menu, 'one menu button').toBe(1)
  expect(b.extras, 'leaderboard, chat, sound and the timeline are not in the bar').toBe(0)
  expect(b.dot, 'a dot for the unread notice').toBe(true)
  await page.screenshot({ path: `${OUT}/bar-normal.png`, clip: { x: 0, y: 0, width: W, height: 120 } })
  await page.screenshot({ path: `${OUT}/bar-normal-full.png` })
  // the menu holds leaderboard, chat, sound, settings (and Notices, with the dot)
  await page.locator('.tb-menu').tap()
  const menu = page.locator('.g-menu')
  await expect(menu).toBeVisible()
  for (const want of ['Weekly leaderboard', 'Campus chat', 'Sound', 'Settings']) await expect(menu.locator('button', { hasText: want }).first()).toBeVisible()
  await expect(menu.locator('[data-go="notices"] .tb-dot')).toHaveCount(1)
  await page.screenshot({ path: `${OUT}/menu.png` })
  // opening Notices clears the dot
  await menu.locator('[data-go="notices"]').tap()
  await page.goto('/?fast=1&morning=0&spawn=quad&n=3#/play')
  await expect(page.locator('.tb-stats')).toBeVisible({ timeout: 30000 })
  expect((await bar(page)).dot).toBe(false)
})

test('B2 a low stat is a solid red pill with white text; reduced motion: no pulse', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 26.7496, hunger: 70, grades: 55, social: 64 })
  const b = await bar(page)
  const energy = b.stats.find((s) => s.k === 'energy')
  expect(energy.band).toBe('low')
  expect(energy.text).toBe('27')
  expect(energy.bg).toBe(RED)
  expect(energy.color).toBe(WHITE)
  // (every run asks for reduced motion: the red pill stays, the pulse does not)
  expect(energy.anim).toBe('none')
  for (const s of b.stats.filter((x) => x.k !== 'energy')) expect(s.bg, `${s.k} has no box`).toBe('rgba(0, 0, 0, 0)')
  await page.screenshot({ path: `${OUT}/bar-low.png`, clip: { x: 0, y: 0, width: W, height: 120 } })
  await page.screenshot({ path: `${OUT}/bar-low-full.png` })
})

test('B3 two low stats pulse together, about once every 1.5 s', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await student(page, { money: 80, energy: 22, hunger: 70, grades: 55, social: 64 })
  const low = (await bar(page)).stats.filter((s) => s.band === 'low')
  expect(low.map((s) => s.k)).toEqual(['money', 'energy'])
  for (const s of low) {
    expect(s.anim).toBe('tb-pulse')
    expect(s.dur).toBe('1.5s')
    expect(s.bg).toBe(RED)
  }
  // one shared phase: the same delay, and the running animations at the same point
  expect(low[0].delay).toBe(low[1].delay)
  const at = await page.evaluate(() => [...document.querySelectorAll('.tb-stat.low')].map((e) => e.getAnimations()[0]?.currentTime % 1500))
  expect(Math.abs(at[0] - at[1])).toBeLessThan(20)
  await context.close()
})

test('B4 the time pill opens the timeline, which closes itself after 4 s; the goal badge shows the goal text', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 86, hunger: 70, grades: 55, social: 64 })
  await expect(page.locator('.tb-timeline')).toHaveCount(0)
  await page.locator('.tb-time').tap()
  const opened = Date.now() // (the 4 s runs from the tap: start the clock here, not after the screenshots)
  await expect(page.locator('.tb-timeline .g-phases li.now')).toBeVisible()
  await expect(page.locator('.tb-timeline')).toContainText('Social')
  await page.screenshot({ path: `${OUT}/bar-timeline.png`, clip: { x: 0, y: 0, width: W, height: 200 } })
  await page.screenshot({ path: `${OUT}/bar-timeline-full.png` })
  await expect(page.locator('.tb-timeline')).toHaveCount(0, { timeout: 8000 })
  const took = Date.now() - opened
  console.log(`timeline closed after ~${took} ms`)
  expect(took).toBeGreaterThan(2500)
  // the goal badge: just "n/3" until tapped, then the goal text (today's three goals, made by the game's own startGoals)
  await page.evaluate(async () => {
    const { startGoals } = await import('/src/engine/goals.js')
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    startGoals(save.run)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&spawn=quad&n=4#/play')
  const badge = page.locator('.g-goalsbtn')
  await expect(badge).toHaveText(/^\D*\d\/3$/, { timeout: 30000 })
  await expect(page.locator('.tb-goal')).toBeHidden()
  await badge.tap()
  await expect(page.locator('.tb-goal')).toBeVisible()
  await expect(page.locator('.tb-goal-list li')).toHaveCount(3)
  await page.screenshot({ path: `${OUT}/goal-text.png`, clip: { x: 0, y: 0, width: W, height: 300 } })
})

// Tap a person where they are on screen (like a player), else start the chat directly.
async function tapPerson(page, id) {
  const at = await page.evaluate((who) => window.mzansiPersonOnScreen(who), id)
  const ok = at && !at.behind && at.x > 20 && at.x < W - 20 && at.y > 300 && at.y < H - 140
  if (ok) await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(500)
  const started = await page.evaluate(() => Boolean(document.getElementById('world').dataset.talking))
  if (!ok || !started) await page.evaluate((who) => window.mzansiTalkTo(who), id)
}

test('B5 during a chat: the bar stays one row and the camera sees both heads (inside no sign or roof)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 26, hunger: 70, grades: 55, social: 64 })
  await tapPerson(page, 'x12')
  await expect(page.locator('.g-talk')).toBeVisible({ timeout: 90000 })
  await expect.poll(async () => page.evaluate(() => { const s = window.mzansiShot(); return Boolean(s?.close && !s.easing) }), { timeout: 15000 }).toBe(true)
  const shot = await page.evaluate(() => window.mzansiShot())
  console.log(JSON.stringify(shot))
  expect(shot.clearView, 'nothing between the camera and either head').toBe(true)
  const b = await bar(page)
  expect(b.height).toBeLessThanOrEqual(H * 0.08)
  // both heads on screen, under the bar and above the chat card
  const cardTop = await page.locator('.g-talk').evaluate((e) => e.getBoundingClientRect().top)
  for (const [x, y] of shot.heads) {
    expect(x).toBeGreaterThan(0)
    expect(x).toBeLessThan(W)
    expect(y).toBeGreaterThan(b.bottom)
    expect(y).toBeLessThan(cardTop)
  }
  await page.screenshot({ path: `${OUT}/chat.png` })
})

// The same bar in the Caf and in SunnyBay: one slim row, and it works there (the timeline and the menu open).
async function barWorks(page, name) {
  const b = await bar(page)
  expect(b.height, `${name}: at most 8% of the screen`).toBeLessThanOrEqual(H * 0.08)
  expect(Math.max(...b.kids.map((k) => k.right))).toBeLessThanOrEqual(W)
  await page.locator('.tb-time').tap()
  await expect(page.locator('.tb-timeline')).toBeVisible()
  await page.screenshot({ path: `${OUT}/${name}-timeline.png` })
  // (on top: nothing of the scene's own buttons covers it)
  const covered = await page.evaluate(() => { const r = document.querySelector('.tb-timeline').getBoundingClientRect(); return [0.1, 0.5, 0.9].filter((f) => !document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2)?.closest('.tb-timeline')).length })
  expect(covered, `${name}: the timeline is on top`).toBe(0)
  await page.locator('.tb-menu').tap()
  await expect(page.locator('.g-menu')).toBeVisible()
  await expect(page.locator('.g-menu button', { hasText: 'Weekly leaderboard' })).toBeVisible()
  await page.locator('.g-menu .ghost[data-act="gear"]').tap()
  await expect(page.locator('.g-menu')).toHaveCount(0)
}

test('B6 the Caf and SunnyBay show the same bar, and it works there', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await atGate(page, { patch: { stats: { money: 1500, energy: 30, grades: 50, social: 64, hunger: 70 } } })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/caf.png` })
  await barWorks(page, 'caf')
  // out of the Caf, then out of the gate into SunnyBay
  await page.locator('.caf-out').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await intoCity(page)
  await page.screenshot({ path: `${OUT}/city.png` })
  await barWorks(page, 'city')
})
