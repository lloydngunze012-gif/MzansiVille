// HUD stat colours (visual only): green 70+, amber 40-69, red under 40 (money: green over
// R500, amber R100-R500, red under R100); red carries a down arrow; only the lowest red
// stat pulses; with reduced motion it's a still outline. Screenshots at 412x915.
// Run: npx playwright test tests/e2e/hud-colours.spec.js --config playwright.gpu.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/hud'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(180000)

async function student(page, stats) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate((s) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    Object.assign(save.run.stats, s)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, stats)
  await page.goto('/?fast=1&morning=0&spawn=quad&n=2#/play')
  await expect(page.locator('.g-stats')).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1500)
}
const pills = (page) => page.locator('.g-stat').evaluateAll((els) => els.map((e) => ({
  k: e.dataset.k, band: e.dataset.band, pulse: e.classList.contains('pulse'), arrow: Boolean(e.querySelector('.g-low')),
  color: getComputedStyle(e.querySelector('.g-stat-top i')).color, anim: getComputedStyle(e).animationName, outline: getComputedStyle(e).outlineStyle,
})))

test('stat pills: red, amber, green; one pulse; arrow on red', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  // money green, energy green, fullness amber, grades red (30), social red and lower (18)
  await student(page, { money: 1500, energy: 85, hunger: 55, grades: 30, social: 18 })
  const p = await pills(page)
  console.log(JSON.stringify(p, null, 1))
  await page.screenshot({ path: `${OUT}/hud-colours.png`, clip: { x: 0, y: 0, width: 412, height: 150 } })
  await page.screenshot({ path: `${OUT}/hud-colours-full.png` })
  const by = Object.fromEntries(p.map((x) => [x.k, x]))
  expect(by.money.band).toBe('good')
  expect(by.hunger.band).toBe('mid')
  expect(by.grades.band).toBe('low')
  expect(by.social.band).toBe('low')
  expect(p.filter((x) => x.pulse).map((x) => x.k)).toEqual(['social'])
  // (every run asks for reduced motion, so the lowest red stat is a still outline, not the pulse)
  expect(by.social.anim).toBe('none')
  expect(by.social.outline).toBe('solid')
  expect(by.grades.arrow && by.social.arrow).toBe(true)
  expect(by.hunger.arrow || by.money.arrow).toBe(false)
})

test('nothing red: nothing pulses; money under R100 is red', async ({ page }) => {
  await student(page, { money: 80, energy: 75, hunger: 45, grades: 72, social: 60 })
  const p = await pills(page)
  expect(p.find((x) => x.k === 'money').band).toBe('low')
  expect(p.filter((x) => x.pulse).map((x) => x.k)).toEqual(['money'])
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); s.run.stats.money = 300; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) })
  await page.goto('/?fast=1&morning=0&spawn=quad&n=3#/play')
  await expect(page.locator('.g-stats')).toBeVisible({ timeout: 30000 })
  const q = await pills(page)
  expect(q.find((x) => x.k === 'money').band).toBe('mid')
  expect(q.filter((x) => x.pulse)).toEqual([])
})

test('reduced motion: a still outline, no animation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:5173' })
  const page = await context.newPage()
  await student(page, { money: 1500, energy: 85, hunger: 55, grades: 30, social: 18 })
  const s = (await pills(page)).find((x) => x.k === 'social')
  await page.screenshot({ path: `${OUT}/hud-colours-reduced.png`, clip: { x: 0, y: 0, width: 412, height: 150 } })
  expect(s.anim).toBe('none')
  expect(s.outline).toBe('solid')
  await context.close()
})

test('leaderboard: screenshot', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { money: 1500, energy: 85, hunger: 55, grades: 30, social: 18 })
  await page.evaluate(() => { location.hash = '#/board' })
  await expect(page.locator('.sc-card')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/board.png` })
})
