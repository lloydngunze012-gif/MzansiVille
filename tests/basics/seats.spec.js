// K19 (owner, 6 Nov): nobody sinks into a seat. Everyone seated in the common room (the
// housemates on the couch and the armchair) and on campus (Quad benches, terrace and caf
// chairs): the seat of their trousers against the real furniture straight under their
// hips. Hooks only READ (the house is entered by walking through its door).
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(400000)

const sinkers = (rows) => rows.filter((r) => r.gap !== null && r.gap < -0.03)

test('K19 nobody sinks into a seat: common-room couches, Quad benches, cafeteria', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const out = {}
  await page.waitForTimeout(2000)
  out.quad = await page.evaluate(() => window.mzansiSeats())
  // Your common room, through the map (a house pin walks you in).
  await tapOn(page, f, page.locator('#world .minimap'))
  const home = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character.residence)
  const pin = await page.evaluate((h) => [...document.querySelectorAll('.map-overlay [data-place]')].find((b) => b.textContent.includes(h.replace(/ House$/, '')))?.dataset.place, home)
  await tapOn(page, f, page.locator(`.map-overlay [data-place="${pin}"]`))
  await expect(page.locator('#world')).toHaveAttribute('data-house', /.+/, { timeout: 60000 })
  await page.waitForTimeout(3000)
  out.common = await page.evaluate(() => window.mzansiSeats())
  await page.screenshot({ path: `${OUT}/K19-common.png` })
  // The cafeteria terrace.
  await page.goto('/?morning=0&spawn=cafeteria&k19=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(6000)
  out.cafeteria = await page.evaluate(() => window.mzansiSeats())
  console.log('K19', JSON.stringify(out, null, 1))
  for (const [where, rows] of Object.entries(out)) {
    const bad = sinkers(rows)
    expect(bad, `${where}: nobody more than 3 cm into a seat`).toEqual([])
  }
  expect(out.common.length, 'housemates seated in the common room').toBeGreaterThan(0)
})
