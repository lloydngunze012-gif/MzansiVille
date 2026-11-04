// Piece 0 (build plan): the houses. Touch only; window.mzansi* hooks are only READ.
// H1: you start in your own house's common room; every house door (map -> the house
// -> Skip there) opens into that house's common room; Head out puts you outside its
// door, and the door prompt takes you back in.
// H2: the house buildings by day and at night (door, banners, sign in their colours).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { OUT, PHONE, finger, read, saveVideo, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(420000)

const HOUSES = JSON.parse(fs.readFileSync('data/campusville/houses.json', 'utf8')).houses
const inHouse = (page) => page.evaluate(() => window.mzansiInHouse())

// The map (the minimap opens it; tap again if the first tap came too soon), then a place.
async function mapTo(page, f, placeId) {
  const pin = page.locator(`.map-pin[data-place="${placeId}"]`)
  for (let i = 0; i < 5 && !(await pin.isVisible()); i++) {
    await tapOn(page, f, page.locator('.minimap'))
    await page.waitForTimeout(800)
  }
  await tapOn(page, f, pin)
}

// Close the place sheet (if it opened over the room) like a player.
async function closeSheet(page, f) {
  const close = page.locator('.g-sheet [data-act="close-sheet"], .g-sheet [data-act="dismiss"]').first()
  if (await close.isVisible().catch(() => false)) { await tapOn(page, f, close); await page.waitForTimeout(600) }
}

test('H1 every house door opens into its own common room; Head out and back in', async ({ page }) => {
  // (no ?spawn: where a player really starts)
  await student(page, { spawn: '' })
  const f = await finger(page)
  const out = { start: null, houses: [] }
  const mine = await page.evaluate(() => document.querySelector('#world').dataset.spawn)
  out.start = { spawn: mine, house: await inHouse(page) }
  await page.screenshot({ path: `${OUT}/H1-start.png` })
  expect(mine).toBe('house')
  expect(out.start.house?.name, 'start in your own house').toBe(HOUSES[0].name)

  for (const h of HOUSES) {
    await mapTo(page, f, h.place)
    const skip = page.locator('.go-skip')
    if (await skip.isVisible().catch(() => false)) await tapOn(page, f, skip)
    await expect.poll(async () => (await inHouse(page))?.id, { timeout: 40000 }).toBe(h.id)
    await page.waitForTimeout(500)
    const sheet = await page.locator('.g-sheet').isVisible().catch(() => false)
    await closeSheet(page, f)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/H1-${h.id}.png` })
    out.houses.push({ id: h.id, in: (await inHouse(page))?.id, sheet })
  }

  // Head out: outside the last house's door; the door prompt takes you back in.
  const last = HOUSES[HOUSES.length - 1]
  await tapOn(page, f, page.locator('.house-out'))
  await expect.poll(() => inHouse(page), { timeout: 5000 }).toBeNull()
  const outside = await read.pos(page)
  const prompt = page.locator('.door-prompt')
  await expect(prompt).toBeVisible({ timeout: 5000 })
  const promptText = await prompt.textContent()
  await page.screenshot({ path: `${OUT}/H1-outside.png` })
  await tapOn(page, f, prompt)
  await expect.poll(async () => (await inHouse(page))?.id, { timeout: 8000 }).toBe(last.id)
  out.headOut = { outside, promptText }
  console.log('H1', JSON.stringify(out))
  for (const r of out.houses) expect(r.in, `${r.id}: its own common room`).toBe(r.id)
  expect(promptText).toContain(last.name)
  await saveVideo(page, 'H1-houses')
})

test('H2 the houses by day and at night', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  for (const hour of [12, 21]) {
    for (const h of HOUSES) {
      // In front of the house, facing it (setup through the URL, as the screenshots do).
      await page.goto(`/?morning=0&spawn=${h.place}&facing=3.14&hour=${hour}#/play`)
      await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `${OUT}/H2-${h.id}-${hour === 12 ? 'day' : 'night'}.png` })
    }
  }
})
