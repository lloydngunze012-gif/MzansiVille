// Sims view first (owner, 11 Nov), in the quick project: every visit starts in Sims whatever was used last time;
// within a visit the choice holds across the scenes; and at every start (first arrival, back from the Caf, into
// SunnyBay, off a taxi, out of a place, after a reload) nothing stands between the camera and the player and the
// player's head is on the picture. (Back from home, day 1's drop-off at the gate: checked in home.spec.js.)
// Screenshots at 390 px (not committed): docs/sprints/sims-first/.
import fs from 'node:fs'
import { test, expect } from '@playwright/test'
import { atGate, city, intoCity, leavePlace, tapWorld } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(300000)
const SHOTS = 'docs/sprints/sims-first'
fs.mkdirSync(SHOTS, { recursive: true })

const campusView = (page) => page.evaluate(() => window.mzansiView())
const cityView = (page) => page.evaluate(() => window.mzansiCity.view())
// A start: Sims, at the scene's normal tilt, a clear line from the camera to the head, the head on the picture.
async function clearStart(page, view, tilt, name) {
  await expect.poll(async () => { const v = await view(page); return v && v.mode === 'sims' && v.blocked === null && v.head.on }, { timeout: 15000, message: `${name}: Sims, nothing between the camera and the player, the head on screen` }).toBe(true)
  const v = await view(page)
  expect(v.pitch, `${name}: the normal tilt`).toBe(tilt)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  return v
}

test('S1 campus: first arrival, back from the Caf, Eye chosen then a reload gives Sims', async ({ page }) => {
  const errors = await atGate(page)
  await clearStart(page, campusView, 52, 'campus-first-arrival')
  // into the Caf and out again: a start on campus
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.locator('.caf-out').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await clearStart(page, campusView, 52, 'campus-back-from-caf')
  // choose Eye: it holds for this visit (the Caf opens in Eye too)...
  await page.locator('.g-view[data-mode="eye"]').tap()
  await expect.poll(async () => (await campusView(page)).mode).toBe('eye')
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await expect(page.locator('.caf-cams [data-cam="eye"]')).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.caf-out').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  expect((await campusView(page)).mode).toBe('eye')
  // ...and is gone on a reload: Sims again, with a clear view
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await expect(page.locator('.g-view[data-mode="sims"]')).toHaveAttribute('aria-pressed', 'true')
  await clearStart(page, campusView, 52, 'campus-after-reload')
  expect(errors).toEqual([])
})

test('S2 SunnyBay: in through the gate road, off a taxi, out of a place, back onto campus, a reload in town', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  await clearStart(page, cityView, 45, 'city-into-sunnybay')
  // a taxi to the Driving school: it stops at the nearest stop
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="driving_school"]').tap()
  await page.locator('.cm-detail [data-way="taxi"]').tap()
  await expect(city(page)).toHaveAttribute('data-rides', '1', { timeout: 60000 })
  await clearStart(page, cityView, 45, 'city-off-a-taxi')
  // hard against a wall, the camera planned inside the block: it turns to the nearest clear angle
  for (const [x, z, f, name] of [[-2, 286, -Math.PI / 2, 'lounge'], [20, 210, Math.PI, 'town'], [160, 14, Math.PI / 2, 'beachfront']]) {
    await page.evaluate(([a, b, c]) => window.mzansiCity.teleport(a, b, c), [x, z, f])
    await clearStart(page, cityView, 45, `city-arrive-${name}`)
  }
  // out of a place
  await page.evaluate(() => window.mzansiCity.goLot('lifecup'))
  await expect(city(page)).toHaveAttribute('data-card', 'todo:lifecup', { timeout: 60000 }) // (its list is up: the helper closes it, then leaves)
  await leavePlace(page)
  await clearStart(page, cityView, 45, 'city-out-of-lifecup')
  // back in through the gate: a start on campus
  await page.evaluate(() => window.mzansiCity.teleport(0, 110, Math.PI))
  await page.waitForTimeout(400)
  await tapWorld(page, 0, 100)
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await clearStart(page, campusView, 52, 'campus-back-from-sunnybay')
  // a save left in town, with Eye chosen, reloads into Sims with a clear view
  await intoCity(page)
  await page.evaluate(() => window.mzansiCity.teleport(20, 210, Math.PI))
  await page.locator('.city-cams [data-cam="eye"]').tap()
  await expect.poll(async () => (await cityView(page)).mode).toBe('eye')
  // (the game saves where you stand while you walk, every few seconds: walk up and down until it has)
  let leg = 0
  await expect.poll(async () => {
    await page.evaluate((z) => window.mzansiCity.walkTo(20, z), leg++ % 2 ? 210 : 216)
    return (await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.cityAt))?.z
  }, { timeout: 40000, intervals: [1500] }).toBeGreaterThan(200)
  await page.reload()
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect(page.locator('.city-cams [data-cam="sims"]')).toHaveAttribute('aria-pressed', 'true')
  await clearStart(page, cityView, 45, 'city-after-reload')
  expect(errors).toEqual([])
})
