// Meeting people (owner, 10 Nov), small fixes and item 5 (one phone; the two-phone parts
// -- the mini card, Wave, Race to the pier, the ring of spots -- are
// tests/presence/city-meet.spec.js). M1: the SunnyBay map's back arrow and the phone's
// own back gesture both close it. M2: walking in SunnyBay drains energy; under 10 a
// friendly hint shows and the pace slows, but a door is always still reachable.
import { test, expect } from '@playwright/test'
import { atGate, intoCity, run } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(180000)

test('M1 SunnyBay map: a back arrow (top left), and the phone back gesture closes it too', async ({ page }) => {
  await atGate(page)
  await intoCity(page)
  await page.locator('[data-city="map"]').tap()
  await expect(page.locator('.cm-overlay')).toBeVisible()
  await page.locator('.cm-back').tap()
  await expect(page.locator('.cm-overlay')).toBeHidden()
  // open again, then the phone's own back gesture (history back) closes it the same way
  await page.locator('[data-city="map"]').tap()
  await expect(page.locator('.cm-overlay')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.cm-overlay')).toBeHidden()
})

test('M2 walking in SunnyBay costs energy; under 10 a hint shows and a door is still reachable', async ({ page }) => {
  await atGate(page, { patch: { stats: { money: 1500, energy: 12, grades: 50, social: 30, hunger: 70 } } })
  await intoCity(page)
  const energyBefore = (await run(page)).stats.energy
  expect(energyBefore).toBeLessThan(15)
  // a brisk walk across Town centre: energy drops, and the low-energy hint appears
  await page.evaluate(() => window.mzansiCity.teleport(0, 190, 0))
  await page.evaluate(() => window.mzansiCity.walkTo(45, 190))
  await expect.poll(async () => (await run(page)).stats.energy, { timeout: 30000 }).toBeLessThan(energyBefore)
  await expect(page.locator('#toast')).toContainText('tired', { timeout: 15000 })
  // still reachable: the walk arrives (slower, never stuck)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCity.info())).player[0], { timeout: 45000 }).toBeGreaterThan(35)
})
