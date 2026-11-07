// The creator's studio (owner, 7 Nov): S1 the student turns all the way round, about 10 s a
// turn, while dancing; S2 a drag turns her by hand and the turn carries on 2 s after you let go;
// S3 picking an outfit eases round to the front and holds it 1.5 s. Real touch for the drag and
// the picks; the page is only READ (window.mzansiStudio). Real GPU.
import { test, expect } from '@playwright/test'
import { finger } from '../basics/touch.js'

const TAU = Math.PI * 2
async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  await page.waitForFunction(() => window.mzansiStudio().rigged && window.mzansiStudio().mode === 'auto')
  return { ctx, page }
}
const read = (page) => page.evaluate(() => window.mzansiStudio())
// (an angle's distance from the front, 0 to pi)
const fromFront = (a) => Math.abs(((a % TAU) + TAU * 1.5) % TAU - Math.PI)

test('S1: a full turn takes about 10 s, and she keeps dancing', async ({ browser }) => {
  const { ctx, page } = await open(browser)
  await page.waitForTimeout(1500) // (the turn eases up to speed)
  const a = await read(page)
  await page.waitForTimeout(6000)
  const b = await read(page)
  const perTurn = (TAU * (b.now - a.now)) / (b.angle - a.angle)
  console.log(`one turn takes ${perTurn.toFixed(1)} s, pose ${b.pose}`)
  expect(perTurn).toBeGreaterThan(8.5)
  expect(perTurn).toBeLessThan(11.5)
  expect(b.pose).toBe('dance')
  // all the way round: the angle has gone past a whole turn in 11 s
  const c = await read(page)
  await page.waitForTimeout(10500)
  const d = await read(page)
  expect(d.angle - c.angle).toBeGreaterThan(TAU * 0.95)
  await ctx.close()
})

test('S2: a drag turns her by hand, the turn resumes 2 s after you let go', async ({ browser }) => {
  const { ctx, page } = await open(browser)
  const f = await finger(page)
  await page.waitForTimeout(500)
  const before = await read(page)
  // a drag across the stage (the stage is under y 110..390)
  await f.drag([[120, 250], [300, 250]], 500)
  const after = await read(page)
  console.log('drag turned her', (after.angle - before.angle).toFixed(2), 'rad; mode', after.mode)
  expect(after.angle - before.angle, 'a 180 px drag turns her a good way').toBeGreaterThan(1.2)
  expect(['rest']).toContain(after.mode)
  await page.waitForTimeout(1500)
  const hold = await read(page)
  expect(Math.abs(hold.angle - after.angle), 'still for the 2 s after you let go').toBeLessThan(0.02)
  await page.waitForTimeout(2200)
  const later = await read(page)
  expect(later.angle - hold.angle, 'turning again').toBeGreaterThan(0.25)
  // and a vertical swipe on the stage still scrolls the page
  await f.drag([[195, 300], [195, 120]], 400)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(20)
  await ctx.close()
})

test('S3: picking an outfit eases to the front and holds it', async ({ browser }) => {
  const { ctx, page } = await open(browser)
  // pick when she is facing away
  await page.waitForFunction(() => { const s = window.mzansiStudio(); return Math.abs(((s.angle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) > 2.6 }, null, { polling: 16, timeout: 20000 })
  const jacket = page.locator('[data-part="outfit"][data-id="jacket"]')
  await jacket.scrollIntoViewIfNeeded()
  await jacket.tap()
  await page.waitForTimeout(1300)
  const front = await read(page)
  console.log('after the pick', front.mode, fromFront(front.angle).toFixed(3))
  expect(['hold']).toContain(front.mode)
  expect(fromFront(front.angle), 'at the front').toBeLessThan(0.03)
  await page.waitForTimeout(1000)
  const mid = await read(page)
  expect(fromFront(mid.angle), 'held at the front').toBeLessThan(0.03)
  await page.waitForTimeout(1200)
  const later = await read(page)
  expect(later.mode).toBe('auto')
  await page.waitForTimeout(800)
  expect(fromFront((await read(page)).angle), 'carries on turning').toBeGreaterThan(0.05)
  await ctx.close()
})
