// Tester fixes 1 (owner, 11 Nov), in the quick project: the Sims view can tilt down to 18 degrees (never under eye height
// and the camera stays out of walls), a meal in a SunnyBay place brings "Finish your student card" like the Caf, and a
// taxi to a pin without its own stop rides to the nearest stop and walks you on to the door (fare once).
// Screenshots at 390 px (not committed): docs/sprints/tester-fixes1/.
import { test, expect } from '@playwright/test'
import { atGate, city, closeResult, info, intoCity, leavePlace, money, pickRow, toDoor } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)
const SHOTS = 'docs/sprints/tester-fixes1'

test('A. the Sims view tilts down to 18 degrees facing the Lounge, never below eye height, 60 stays the top', async ({ page }) => {
  const errors = await atGate(page, { patch: { cityAt: { x: 20, z: 210 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await page.evaluate(() => window.mzansiCity.teleport(-2, 286, -Math.PI / 2)) // (outside the Lounge's door, facing it)
  await page.waitForTimeout(900)
  expect(await page.evaluate(() => window.mzansiCity.tilt(-5000))).toBeCloseTo(18, 0)
  expect(await page.evaluate(() => window.mzansiCity.tilt(5000))).toBeCloseTo(60, 0)
  await page.evaluate(() => window.mzansiCity.tilt(-5000))
  await page.waitForTimeout(1200)
  const cam = await page.evaluate(() => window.mzansiCity.camera())
  expect(cam.mode).toBe('sims')
  expect(cam.pitch).toBeCloseTo(18, 0)
  expect(cam.y).toBeGreaterThanOrEqual(1.2) // (eye height: never under it, so never under the ground)
  await page.screenshot({ path: `${SHOTS}/lowest-lounge.png` })
  // walk round the corner of the block at the lowest angle: the camera is never under eye height
  for (const [x, z] of [[-2, 270], [-2, 300], [10, 286]]) {
    await page.evaluate(([a, b]) => window.mzansiCity.teleport(a, b, -Math.PI / 2), [x, z])
    await page.waitForTimeout(500)
    expect((await page.evaluate(() => window.mzansiCity.camera())).y).toBeGreaterThanOrEqual(1.2)
  }
  expect(errors).toEqual([])
})

test('B. a first meal at Lifecup brings the student card prompt at the next calm moment', async ({ page }) => {
  const errors = await atGate(page, { patch: { cityAt: { x: 20, z: 210 }, cardAsked: '', cardDone: false, phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: { money: 300, energy: 90, grades: 50, social: 60, hunger: 40 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)).quick).toBe(true)
  await toDoor(page, 'lifecup')
  expect(await page.evaluate(() => window.mzansiLaunch.pending())).toBe('')
  await pickRow(page, 'lifecup_eat_a_muffin')
  await closeResult(page)
  await leavePlace(page) // (a list on screen is not a calm moment)
  const prompt = page.locator('.sl-pop[data-reason="meal"]')
  await expect(prompt).toBeVisible({ timeout: 20000 })
  await expect(prompt).toContainText('Finish your student card')
  await page.screenshot({ path: `${SHOTS}/card-prompt-lifecup.png` })
  expect(errors).toEqual([])
})

test('C. a taxi from the campus gate to the Driving school stops at the nearest stop and walks you on, fare once', async ({ page }) => {
  const errors = await atGate(page, { patch: { money: 400 } })
  await intoCity(page)
  const before = await money(page)
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="driving_school"]').tap()
  const taxi = page.locator('.cm-detail [data-way="taxi"]')
  await expect(taxi.locator('small')).toHaveText(/^Taxi to .+, then a short walk$/)
  const fare = Number((await taxi.locator('b').innerText()).match(/R(\d+)/)[1])
  await page.screenshot({ path: `${SHOTS}/travel-driving-school.png` })
  await taxi.tap()
  await expect(city(page)).toHaveAttribute('data-rides', '1', { timeout: 60000 })
  expect(await city(page).getAttribute('data-ride-stop')).not.toBe('')
  // the walk on to the door ends in the school's list, with the fare charged once
  await expect(city(page)).toHaveAttribute('data-card', 'todo:driving_school', { timeout: 60000 })
  expect(await money(page)).toBe(before - fare)
  expect((await info(page)).part).toBe('industrial')
  expect(errors).toEqual([])
})
