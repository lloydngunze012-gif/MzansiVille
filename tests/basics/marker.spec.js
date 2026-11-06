// K18 (owner, 6 Nov): a tap on a place (its glowing marker, its building) walks all the
// way there, however far, and its sheet opens at the door; never a stop a few steps
// out. From the Quad, in Top view (the whole campus in sight), each place is tapped
// on its yellow pin in the campus map, with a real finger. Hooks only READ.
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(600000)

const PLACES = ['library', 'sports_centre', 'cafeteria', 'smig', 'law']

test('K18 tap a place far away: you walk all the way to its door and it opens', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const out = []
  for (const id of PLACES) {
    await page.goto(`/?morning=0&spawn=quad&k18=${id}#/play`)
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
    await page.waitForTimeout(2500)
    // The campus map (the minimap opens it): tap the place's yellow pin.
    await tapOn(page, f, page.locator('#world .minimap'))
    await expect(page.locator('.map-overlay')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/K18-map.png` })
    const at = { door: await page.evaluate((pid) => window.mzansiDoorOf(pid), id) }
    const from = await page.evaluate(() => window.mzansiPlayerPos())
    const startDist = Math.hypot(at.door.x - from.x, at.door.z - from.z)
    await tapOn(page, f, page.locator(`.map-overlay [data-place="${id}"]`))
    // Arrive: the place opens (its sheet, or the lecture), within 60 s.
    let opened = false
    const t0 = Date.now()
    while (Date.now() - t0 < 60000 && !opened) {
      await page.waitForTimeout(500)
      opened = await page.evaluate((pid) => location.hash.includes(pid) || Boolean(document.querySelector('#world')?.dataset.activity === 'lecture') || location.hash.includes('lecture'), id)
    }
    const p = await page.evaluate(() => window.mzansiPlayerPos())
    const left = Math.hypot(at.door.x - p.x, at.door.z - p.z)
    const tries = await page.evaluate(() => document.querySelector('#world').dataset.walkTries)
    await page.screenshot({ path: `${OUT}/K18-${id}.png` })
    out.push({ id, startDist: +startDist.toFixed(1), opened, left: +left.toFixed(2), seconds: Math.round((Date.now() - t0) / 1000), reroutes: Number(tries || 0) })
  }
  console.log('K18', JSON.stringify(out, null, 1))
  const tried = out.filter((r) => !r.skipped)
  expect(tried.length, 'at least three places tried').toBeGreaterThanOrEqual(3)
  for (const r of tried) {
    expect(r.opened, `${r.id}: it opened`).toBe(true)
    expect(r.left, `${r.id}: at its door, not a few steps out`).toBeLessThan(2.6)
  }
})
