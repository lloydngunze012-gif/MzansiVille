// SunnyBay, the short test for the quick project (City job A): out of the Main Gate into the city, the map,
// a taxi to the Mall's door with the fare charged, an "Opening soon" door, and back onto campus.
// The full set is tests/e2e/city.spec.js.
import { test, expect } from '@playwright/test'
import { atGate, city, info, intoCity, money, run, tapWorld } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

test('SunnyBay: out of the gate, the map, a taxi to the Mall, back onto campus', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  await expect(page.locator('#world')).toHaveAttribute('data-on', '0')
  await expect(city(page)).toHaveAttribute('data-part', 'campus')
  // the city is cheap to draw and there is ground under the whole picture
  const i = await info(page)
  expect(i.calls).toBeLessThan(140)
  expect(await page.evaluate(() => window.mzansiCity.coverage())).toBeGreaterThan(0.97)
  const before = await money(page)
  await page.locator('[data-city="map"]').tap()
  await expect(page.locator('.cm-head h2')).toHaveText('SunnyBay')
  await expect(page.locator('.cm-pin')).toHaveCount(19)
  await page.locator('.cm-pin[data-pin="mall"]').tap()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toBeDisabled() // (no licence, no car)
  await page.locator('.cm-detail [data-way="taxi"]').tap()
  await expect(city(page)).toHaveAttribute('data-rides', '1', { timeout: 60000 })
  await expect(city(page)).toHaveAttribute('data-card', 'lot:mall')
  await expect(page.locator('.city-card')).toContainText('Opening soon')
  expect(await money(page)).toBe(before - 15)
  await expect(city(page)).toHaveAttribute('data-part', 'town')
  // back: to the gate and in through it
  await page.locator('.city-card [data-city="close"]').tap()
  await page.evaluate(() => window.mzansiCity.teleport(0, 110, Math.PI))
  await page.waitForTimeout(400)
  await tapWorld(page, 0, 100)
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  expect((await run(page)).cityAt).toBeFalsy()
  expect(errors).toEqual([])
})
