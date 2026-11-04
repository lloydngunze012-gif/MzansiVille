// K14 (owner, 4 Nov, after the presence phone test): "I wanted to look left, it just
// started moving left". Distance decides: a swipe (over 24 px) turns the view and never
// walks; a tap (under 16 px, under 420 ms) walks; a long press that never moves does
// nothing. Touch only; window.mzansi* hooks and data-* attributes are only READ.
// (K15, walking at someone standing in the way, is in docs/backlog.md for now.)
import { test, expect } from '@playwright/test'
import { OUT, PHONE, finger, read, saveVideo, student, tapOn } from './touch.js'

test.use(PHONE)
test.setTimeout(300000)

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const view = async (page) => Number(await page.locator('#world').getAttribute('data-view'))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

test('K14 a swipe turns the view and never walks; a long press does nothing; a tap walks', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const out = {}
  for (const mode of ['sims', 'eye']) {
    await tapOn(page, f, page.locator(`.g-view[data-mode="${mode}"]`))
    await expect(page.locator('#world')).toHaveAttribute('data-cam', mode)
    await page.waitForTimeout(800)
    const r = {}
    for (const [name, from, to] of [['left', [300, 470], [110, 470]], ['right', [110, 470], [300, 470]]]) {
      const p0 = await read.pos(page)
      const v0 = await view(page)
      await f.drag([from, to], 350)
      await page.waitForTimeout(1200)
      const p1 = await read.pos(page)
      r[name] = { turned: +(wrap((await view(page)) - v0) * 180 / Math.PI).toFixed(0), moved: +dist(p0, p1).toFixed(3), state: await read.state(page) }
      if (mode === 'eye') r[name].body = +(wrap((await read.rot(page)) - (await view(page))) * 180 / Math.PI).toFixed(0)
    }
    out[mode] = r
    await page.screenshot({ path: `${OUT}/K14-${mode}.png` })
  }
  // A long press on the ground that never moves: nothing happens. Held, then slid: a
  // swipe, the view turns, still no walking.
  await tapOn(page, f, page.locator('.g-view[data-mode="sims"]'))
  await page.waitForTimeout(600)
  const h0 = await read.pos(page)
  await f.down(206, 360)
  await page.waitForTimeout(900)
  await f.up()
  await page.waitForTimeout(1200)
  const press = { moved: +dist(h0, await read.pos(page)).toFixed(3), state: await read.state(page) }
  const v1 = await view(page)
  await f.down(206, 360)
  await page.waitForTimeout(600)
  for (let i = 1; i <= 8; i++) { await f.move(206 + i * 15, 360); await page.waitForTimeout(60) }
  await f.up()
  await page.waitForTimeout(1200)
  const holdSlide = { moved: +dist(h0, await read.pos(page)).toFixed(3), turned: +(wrap((await view(page)) - v1) * 180 / Math.PI).toFixed(0) }
  // A tap: walks.
  const t0 = await read.pos(page)
  await f.tap(206, 330)
  await page.waitForTimeout(2500)
  const tap = { moved: +dist(t0, await read.pos(page)).toFixed(2) }
  console.log('K14', JSON.stringify({ ...out, press, holdSlide, tap }))
  for (const mode of ['sims', 'eye']) {
    for (const dir of ['left', 'right']) {
      expect(out[mode][dir].moved, `${mode} swipe ${dir}: no walking`).toBeLessThan(0.05)
      expect(Math.abs(out[mode][dir].turned), `${mode} swipe ${dir}: the view turns`).toBeGreaterThan(30)
    }
    // Swiping left looks left, right looks right (opposite turns).
    expect(Math.sign(out[mode].left.turned)).toBe(-Math.sign(out[mode].right.turned))
  }
  // In Eye view the student turns with the view (standing).
  expect(Math.abs(out.eye.left.body), 'eye: the body faces the new view').toBeLessThan(10)
  expect(press.moved, 'a long press does nothing').toBeLessThan(0.05)
  expect(holdSlide.moved, 'held then slid: no walking').toBeLessThan(0.05)
  expect(Math.abs(holdSlide.turned), 'held then slid: the view turns').toBeGreaterThan(30)
  expect(tap.moved, 'a tap walks').toBeGreaterThan(0.5)
  await saveVideo(page, 'K14-swipe-look')
})
