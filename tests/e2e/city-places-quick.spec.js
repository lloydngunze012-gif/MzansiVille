// City job B, the short test for the quick project: a Room (Lifecup) opens from its door with ten rows, a row
// runs (money, fullness, the result line on the result card), the way back out leads to the same door; and an
// open-ground place (the Taxi rank) opens its list on the lot. The full set is tests/e2e/city-places.spec.js.
import { test, expect } from '@playwright/test'
import { atGate, city, closeResult, info, leavePlace, pickRow, placeNow, run, toDoor } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

test('SunnyBay places: into Lifecup, ten things to do, a muffin, back out at the door; the Taxi rank on its lot', async ({ page }) => {
  const errors = await atGate(page, { patch: { cityAt: { x: 20, z: 210 }, phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: { money: 300, energy: 90, grades: 50, social: 30, hunger: 40 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  const at = await toDoor(page, 'lifecup')
  await expect(page.locator('body')).toHaveAttribute('data-city-place', 'lifecup')
  await expect(page.locator('.city-todo .ct-row')).toHaveCount(10)
  await expect(page.locator('.city-todo h3')).toContainText('Lifecup cafe')
  expect((await page.locator('.city-todo').boundingBox()).height).toBeLessThanOrEqual(844 * 0.6 + 1)
  const now = await placeNow(page)
  expect(now.inside).toBe('lifecup')
  expect(now.folk.n).toBeGreaterThanOrEqual(3)
  expect(new Set(now.folk.skins).size).toBeGreaterThanOrEqual(3)
  // a room is cheap to draw
  expect((await info(page)).calls).toBeLessThan(120)
  const before = await run(page)
  await pickRow(page, 'lifecup_eat_a_muffin')
  await expect(page.locator('.city-result')).toContainText('It is gone before the lid is back on the tin.')
  const after = await run(page)
  expect(Math.floor(after.stats.money)).toBe(Math.floor(before.stats.money) - 25)
  expect(after.stats.hunger).toBe(before.stats.hunger + 14)
  expect(after.counts.activity.lifecup_eat_a_muffin).toBe(1)
  await closeResult(page)
  // (closed, it is no longer a .g-result: the campus's "is a card open?" checks look for one anywhere in the page)
  await expect(page.locator('.g-result')).toHaveCount(0)
  // the dear row is greyed, with the reason
  const tab = page.locator('.ct-row[data-row="lifecup_put_the_upstairs_on_your_tab"]')
  await expect(tab).toHaveAttribute('data-why', 'money')
  await expect(tab.locator('.ct-why')).toHaveText(/^Needs R1.000\. You have R\d+\.$/)
  await leavePlace(page)
  const back = await info(page)
  expect(Math.hypot(back.player[0] - at.door.x, back.player[1] - at.door.z)).toBeLessThan(6)
  await expect(page.locator('body')).not.toHaveAttribute('data-city-place', 'lifecup')
  // open ground: the list opens on the lot itself
  await toDoor(page, 'taxi_rank')
  await expect(page.locator('.city-todo .ct-row')).toHaveCount(10)
  expect((await placeNow(page)).inside).toBe('')
  expect(errors).toEqual([])
})

// Repeat limit (meta.cityRepeat): the back pew three times in one day gives full, half, then nothing.
test('SunnyBay places: the back pew three times in a day pays full, half, then is greyed', async ({ page }) => {
  const errors = await atGate(page, { patch: { cityAt: { x: 20, z: 210 }, phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: { money: 300, energy: 50, grades: 50, social: 30, hunger: 40 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await toDoor(page, 'church')
  const id = 'church_sit_in_a_back_pew'
  const gains = []
  for (let i = 0; i < 2; i++) {
    const b = await run(page)
    await pickRow(page, id)
    await closeResult(page)
    gains.push(Math.round((await run(page)).stats.energy - b.stats.energy))
  }
  expect(gains).toEqual([8, 4])
  const row = page.locator(`.ct-row[data-row="${id}"]`)
  await expect(row).toHaveAttribute('data-why', 'repeat')
  await expect(row.locator('.ct-why')).toHaveText('Come back tomorrow')
  expect(errors).toEqual([])
})
