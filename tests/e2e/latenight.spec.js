// No "END OF THE DAY" (owner, 6 Nov): using the day's last slot at night doesn't stop
// play: a soft "Late night on campus" line, and you carry on. Going to bed (Sleep, which
// needs no slot) ends the day and the next morning starts (you wake in your room);
// no screen that stops play at any point.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'test-results/latenight'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(240000)

test('last slot at night: Late night on campus, carry on; bed starts the next day, no end screen', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 200)) })
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)))
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'night', minutes: 21 * 60 + 30, lectureResolved: true, slotsLeft: 1 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  // Watch the whole time: an end-of-day screen must never show.
  await page.goto('/?fast=1&morning=0&spawn=res_o#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.evaluate(() => { window.__endScreen = false; setInterval(() => { if (document.querySelector('.g-summary, [data-screen="summary"]') || /end of (the )?day/i.test(document.querySelector('.g-kind')?.textContent || '')) window.__endScreen = true }, 100) })
  await page.evaluate(() => { location.hash = '#/place/res_o' })
  // The last slot: something in the house at night.
  const act = page.locator('[data-act="do"][data-id="house_shedding"]')
  await act.waitFor({ state: 'visible', timeout: 15000 })
  await act.tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 60000 })
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('mzansiville.v1')).run; return { mode: r.mode, phase: r.phase, day: r.day, slots: r.slotsLeft, lateNight: r.lateNight } })
  const toast = await page.evaluate(() => (document.body.innerText.includes('Late night on campus') ? 'Late night on campus' : ''))
  const bar = await page.evaluate(() => document.querySelector('.g-cta p')?.textContent || '')
  console.log('AFTER', JSON.stringify(after), 'TOAST', toast, 'BAR', bar)
  await page.screenshot({ path: `${OUT}/1-late-night.png`, timeout: 15000 }).catch((e) => console.log('SHOT', e.message.slice(0, 80)))
  // You carry on: walking still works (a tap on the ground moves you).
  const before = await page.evaluate(() => window.mzansiPlayerPos())
  const spot = await page.evaluate(() => { const p = window.mzansiPlayerPos(); for (const [dx, dz] of [[3, 3], [-3, 3], [3, -3], [-3, -3], [0, 4]]) { const s = window.mzansiScreenOf(p.x + dx, p.z + dz, 0); if (s && !s.behind && s.y > 300 && s.y < 700 && window.mzansiOpen(p.x + dx, p.z + dz)) return s } return null })
  if (spot) await page.touchscreen.tap(spot.x, spot.y)
  await page.waitForTimeout(2500)
  const moved = await page.evaluate((b) => { const p = window.mzansiPlayerPos(); return Math.hypot(p.x - b.x, p.z - b.z) }, before)
  // Bed: Sleep needs no slot, and the next morning starts.
  await page.evaluate(() => { location.hash = '#/place/res_o' })
  const bed = page.locator('[data-act="do"][data-id="sleep"]')
  await bed.waitFor({ state: 'visible', timeout: 15000 })
  const bedDisabled = await bed.isDisabled()
  await bed.tap()
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.day), { timeout: 90000 }).toBe(2)
  await page.waitForTimeout(4000)
  const next = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('mzansiville.v1')).run; return { mode: r.mode, phase: r.phase, day: r.day } })
  await page.screenshot({ path: `${OUT}/2-next-morning.png`, timeout: 15000 }).catch((e) => console.log('SHOT', e.message.slice(0, 80)))
  const endScreen = await page.evaluate(() => window.__endScreen)
  console.log('LATE', JSON.stringify({ after, toast, bar, moved: +moved.toFixed(2), bedDisabled, next, endScreen }))
  expect(after.mode).toBe('play')
  expect(after.phase).toBe('night')
  expect(after.lateNight).toBe(1)
  expect(`${toast} ${bar}`).toContain('Late night on campus')
  expect(moved, 'you carry on: walking works').toBeGreaterThan(0.5)
  expect(bedDisabled, 'bed needs no slot').toBe(false)
  expect(next.mode).toBe('play')
  expect(next.day).toBe(2)
  expect(endScreen, 'no end-of-the-day screen at any point').toBe(false)
})
