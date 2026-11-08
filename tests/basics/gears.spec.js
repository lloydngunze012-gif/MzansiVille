// G1: quick taps while moving move up a gear (walk 2.3, jog 4, run 6 m/s), at most three; a tap
// after a pause starts again at walk. G2: a direction held for a second jogs, Shift runs.
// npx playwright test tests/basics/gears.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, student, finger, tapOn, groundAhead } from './touch.js'

test.use(PHONE)
test.describe.configure({ timeout: 300000 })

test('G1 quick taps move up a gear: walk, jog, run, no more', async ({ page }) => {
  await student(page, { spawn: 'gate' })
  const f = await finger(page)
  await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
  await page.waitForTimeout(1200)
  const pace = () => page.evaluate(() => window.mzansiWalkPace().speed)
  const seen = []
  for (const d of [8, 9, 10, 11, 12]) {
    const t = await groundAhead(page, d)
    expect(t, 'a spot on screen').toBeTruthy()
    await f.tap(t.s.x, t.s.y)
    await page.waitForTimeout(350)
    seen.push(await pace())
  }
  console.log('G1 paces on five quick taps', JSON.stringify(seen))
  expect(seen[0]).toBeCloseTo(2.3, 1)
  expect(seen[1]).toBeCloseTo(4, 1)
  expect(seen[2]).toBeCloseTo(6, 1)
  expect(Math.max(...seen)).toBeLessThanOrEqual(6.01)
  // (stop, then a slow tap: back to a walk)
  await tapOn(page, f, page.locator('.stop-btn'))
  await page.waitForTimeout(1800)
  const t = await groundAhead(page, 8)
  await f.tap(t.s.x, t.s.y)
  await page.waitForTimeout(300)
  expect(await pace(), 'back to walk after stopping').toBeCloseTo(2.3, 1)
})

test('G2 keyboard: held direction jogs after a second, Shift runs', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const now = () => page.evaluate(() => window.mzansiWalkPace().now)
  await page.keyboard.down('d')
  await page.waitForTimeout(600)
  const a = await now()
  await page.waitForTimeout(1400)
  const b = await now()
  await page.keyboard.down('Shift')
  await page.waitForTimeout(1200)
  const c = await now()
  await page.keyboard.up('Shift')
  await page.keyboard.up('d')
  console.log('G2 speeds', a, b, c)
  expect(a).toBeLessThan(2.6)
  expect(b).toBeGreaterThan(3.3)
  expect(c).toBeGreaterThan(4.8)
})
