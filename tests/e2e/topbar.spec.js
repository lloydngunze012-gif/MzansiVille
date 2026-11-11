// The compact top bar (owner, 10 Nov; two rows 11 Nov), at 390 px. At most 11% of the screen.
// Row 1: the time pill with the day inside, the players chip ("N on campus", "N in SunnyBay"),
// the goal badge, one menu button (leaderboard, chat, sound, settings) with a dot for anything
// new. Row 2: the five stats as small boxes, each with its name, a whole number and a thin bar.
// A low stat is a solid red pill with white text that pulses gently (two low stats in step; no
// pulse under reduced motion). The time pill opens the day's timeline, which closes itself
// after 4 s; the goal badge shows the goal text. During a chat the camera has both heads in plain view (never
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
  // (today's three goals, made by the game's own startGoals: the badge is in the bar)
  await page.evaluate(async () => {
    const { startGoals } = await import('/src/engine/goals.js')
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    startGoals(save.run)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&spawn=quad&n=2#/play')
  await expect(page.locator('.tb-stats')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
}
const bar = (page) => page.evaluate(() => {
  const hud = document.querySelector('.g-hud').getBoundingClientRect()
  const row = document.querySelector('.tb-row')
  const rect = (e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }
  const kids = [...row.children].map((e) => ({ cls: e.className, ...rect(e) }))
  const statsBox = rect(document.querySelector('.tb-stats'))
  const stats = [...document.querySelectorAll('.tb-stat')].map((e) => {
    const r = e.getBoundingClientRect()
    const cs = getComputedStyle(e)
    const lab = e.querySelector('b')
    const num = e.querySelector('i')
    const barEl = e.querySelector('u')
    return {
      k: e.dataset.k, band: e.dataset.band, text: num.innerText, label: lab.innerText, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
      labelPx: getComputedStyle(lab).fontSize, labelColor: getComputedStyle(lab).color, numPx: getComputedStyle(num).fontSize, numWeight: getComputedStyle(num).fontWeight,
      barPx: barEl.getBoundingClientRect().height, fill: e.querySelector('s').getBoundingClientRect().width, inner: barEl.getBoundingClientRect().width,
      cut: lab.scrollWidth > lab.clientWidth + 1 || num.scrollWidth > num.clientWidth + 1,
      bg: cs.backgroundColor, color: getComputedStyle(num).color, anim: cs.animationName, dur: cs.animationDuration, delay: e.style.animationDelay,
    }
  })
  const chip = document.querySelector('.tb-online')
  const badge = document.querySelector('.tb-row .g-goalsbtn')
  return {
    height: hud.height, bottom: hud.bottom, kids, stats, statsBox, scrollW: document.querySelector('.g-hud').scrollWidth,
    time: document.querySelector('.tb-time').innerText, menu: document.querySelectorAll('.tb-row [data-act="gear"]').length,
    dot: Boolean(document.querySelector('.tb-menu .tb-dot')),
    chip: chip ? { text: chip.innerText, row: chip.parentElement === row, cut: chip.scrollWidth > chip.clientWidth + 1, ...rect(chip) } : null,
    badge: badge ? { text: badge.innerText, row: badge.parentElement === row } : null,
    extras: document.querySelectorAll('.g-hud a[href="#/board"], .g-hud a[href="#/chat"], .g-hud [data-act="sound"], .g-hud .g-phases').length,
  }
})
const LABELS = ['Money', 'Energy', 'Fullness', 'Grades', 'Social']
// The bar's shape, wherever it is (campus, Caf, SunnyBay) and at any phone width.
function barShape(b, w, h, name) {
  expect(b.height, `${name}: at most 11% of the screen height (${(b.height / h * 100).toFixed(1)}%)`).toBeLessThanOrEqual(h * 0.11)
  expect(Math.max(...b.kids.map((k) => k.right)), `${name}: row 1 inside the screen`).toBeLessThanOrEqual(w)
  expect(Math.max(...b.stats.map((x) => x.right)), `${name}: row 2 inside the screen`).toBeLessThanOrEqual(w)
  expect(b.scrollW, `${name}: nothing wider than the bar`).toBeLessThanOrEqual(w + 1)
  // row 1: one band; row 2 below it
  const tops = b.kids.map((k) => k.top)
  expect(Math.max(...tops) - Math.min(...tops), `${name}: row 1 is one row`).toBeLessThan(8)
  expect(b.statsBox.top, `${name}: the stats are the second row`).toBeGreaterThanOrEqual(Math.max(...b.kids.map((k) => k.bottom)) - 1)
  expect(b.chip, `${name}: the players chip`).toBeTruthy()
  expect(b.chip.row && !b.chip.cut, `${name}: the players chip is in row 1 and whole`).toBe(true)
  expect(b.chip.text, name).toMatch(/^\d+ (on campus|in SunnyBay)$/)
  expect(b.stats.map((x) => x.label), `${name}: every stat has its name`).toEqual(LABELS)
  for (const x of b.stats) expect(x.cut, `${name}: ${x.k} is not cut off`).toBe(false)
  for (let i = 1; i < b.stats.length; i++) expect(b.stats[i].left, name).toBeGreaterThanOrEqual(b.stats[i - 1].right - 0.5)
}
const RED = 'rgb(212, 47, 37)'
const WHITE = 'rgb(255, 255, 255)'

test('B1 two rows: time pill, players chip, goal badge, menu; then the five labelled stats with a bar each', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 86.7496, hunger: 70, grades: 55, social: 64 }, { inbox: [{ from: 'Zoe', text: 'Caf later?', read: true }], inboxSeen: 0 })
  const b = await bar(page)
  console.log(JSON.stringify({ height: b.height, pct: (b.height / H * 100).toFixed(1), time: b.time, chip: b.chip.text, stats: b.stats.map((s) => [s.label, s.text]) }))
  barShape(b, W, H, 'campus')
  expect(b.time).toMatch(/[A-Z]{3}\s*13:00/i)
  expect(b.chip.text).toMatch(/^\d+ on campus$/)
  expect(b.badge, 'the goal badge is in row 1').toBeTruthy()
  expect(b.badge.row).toBe(true)
  expect(b.badge.text).toMatch(/\d\/3/)
  expect(b.stats.map((s) => s.k)).toEqual(['money', 'energy', 'hunger', 'grades', 'social'])
  for (const s of b.stats) expect(s.text, `${s.k} is a whole number`).toMatch(/^-?R?[\d\s ]+$|^R\d+(\.\d)?k$/)
  expect(b.stats.find((s) => s.k === 'energy').text).toBe('87')
  // the small boxes: label 10 px, number 14 px bold, bar 3 px, the fill follows the value
  for (const s of b.stats) {
    expect(s.labelPx, s.k).toBe('10px')
    expect(s.numPx, s.k).toBe('14px')
    expect(Number(s.numWeight), s.k).toBeGreaterThanOrEqual(700)
    expect(s.barPx, s.k).toBe(3)
  }
  const energy = b.stats.find((s) => s.k === 'energy')
  expect(energy.fill / energy.inner, 'the energy bar is 87% full').toBeGreaterThan(0.8)
  expect(b.menu, 'one menu button').toBe(1)
  expect(b.extras, 'leaderboard, the old lobby link, sound and the timeline are not in the bar (the chat button is: Chat sprint)').toBe(0)
  expect(b.dot, 'a dot for the unread notice').toBe(true)
  await page.screenshot({ path: `${OUT}/bar-normal.png`, clip: { x: 0, y: 0, width: W, height: 120 } })
  await page.screenshot({ path: `${OUT}/bar-normal-full.png` })
  // the menu holds leaderboard, chat, sound, settings (and Notices, with the dot)
  await page.locator('.tb-menu').tap()
  const menu = page.locator('.g-menu')
  await expect(menu).toBeVisible()
  for (const want of ['Weekly leaderboard', 'Chat', 'Sound', 'Settings']) await expect(menu.locator('button', { hasText: want }).first()).toBeVisible()
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
  // (the name stays readable inside the red pill: white on red)
  expect(energy.label).toBe('Energy')
  expect(energy.labelColor).toBe(WHITE)
  barShape(b, W, H, 'low stat')
  for (const s of b.stats.filter((x) => x.k !== 'energy')) {
    expect(s.bg, `${s.k} is a plain box, not red`).not.toBe(RED)
    expect(s.labelColor, `${s.k} label is not white on cream`).not.toBe(WHITE)
  }
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
  expect(low.map((s) => s.label)).toEqual(['Money', 'Energy'])
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
  // the goal badge (in row 1): just "n/3" until tapped, then the goal text (today's three goals)
  const badge = page.locator('.g-goalsbtn')
  await expect(badge).toHaveText(/^\D*\d\/3$/, { timeout: 30000 })
  expect(await badge.evaluate((e) => e.parentElement.classList.contains('tb-row')), 'the badge is in row 1').toBe(true)
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
  // (the move to the two-shot has begun, eases >= 1, and ended: read a moment earlier, "not easing" is also true of the
  // follow camera that has not set off yet, which is what this test used to catch about half the time)
  await expect.poll(async () => page.evaluate(() => { const s = window.mzansiShot(); return Boolean(s?.close && s.eases >= 1 && !s.easing) }), { timeout: 15000 }).toBe(true)
  const shot = await page.evaluate(() => window.mzansiShot())
  console.log(JSON.stringify(shot))
  expect(shot.clearView, 'nothing between the camera and either head').toBe(true)
  const b = await bar(page)
  expect(b.height).toBeLessThanOrEqual(H * 0.11)
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

// The same bar in the Caf and in SunnyBay: two rows, the players chip, and it works there (the timeline and the menu open).
async function barWorks(page, name) {
  // (the city puts you in its district's room after a moment in it; the chip follows)
  if (name === 'city') await expect(page.locator('.tb-online')).toHaveText(/^\d+ in SunnyBay$/, { timeout: 20000 })
  const b = await bar(page)
  barShape(b, W, H, name)
  expect(b.chip.text, `${name}: the players chip reads`).toMatch(name === 'city' ? /^\d+ in SunnyBay$/ : /^\d+ on campus$/)
  expect(b.badge?.row, `${name}: the goal badge is in row 1`).toBe(true)
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
  await atGate(page, { patch: { stats: { money: 1500, energy: 30, grades: 50, social: 64, hunger: 70 }, goals: { day: 1, list: [{ id: 'lecture1', kind: 'must', done: false }, { id: 'meet2', kind: 'story', done: false }, { id: 'social10', kind: 'dream', done: false }] } } })
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

// Other phone widths: the bar stays under 11% of the height, nothing is cut off, a low stat keeps its name readable.
for (const [w, h] of [[360, 740], [414, 896]]) {
  test(`B7 the bar at ${w} px: under 11%, nothing cut off`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: w, height: h })
    await student(page, { money: 1500, energy: 26.7496, hunger: 70, grades: 55, social: 64 })
    const b = await bar(page)
    console.log(JSON.stringify({ w, height: b.height, pct: (b.height / h * 100).toFixed(1), chip: b.chip.text, stats: b.stats.map((s) => [s.label, s.text]) }))
    barShape(b, w, h, `${w} px`)
    expect(b.badge?.row).toBe(true)
    const low = b.stats.find((s) => s.k === 'energy')
    expect([low.bg, low.labelColor, low.color]).toEqual([RED, WHITE, WHITE])
    await page.screenshot({ path: `${OUT}/bar-${w}.png`, clip: { x: 0, y: 0, width: w, height: 130 } })
  })
}
