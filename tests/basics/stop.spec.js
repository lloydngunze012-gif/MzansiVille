// K12: tap 15 m away, after a second tap Stop: standing still within 0.4 s, within
// 0.3 m of where you were when Stop was tapped. K13: tap a spot behind something solid:
// the player gives up within 2 s instead of pushing into it.
// npx playwright test tests/basics/stop.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, OUT, student, finger, read, saveVideo, tapOn, dist, groundAhead } from './touch.js'

test.use(PHONE)
test.describe.configure({ timeout: 300000 })

test('K12 tap 15 m away, then Stop: standing still within 0.4 s and 0.3 m', async ({ page }) => {
  await student(page, { spawn: 'gate' })
  const f = await finger(page)
  // (the Top camera: 15 m fits on a phone screen)
  await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
  await page.waitForTimeout(1200)
  const far = await groundAhead(page, 15)
  expect(far, 'a spot 15 m away on screen').toBeTruthy()
  await f.tap(far.s.x, far.s.y)
  await page.waitForTimeout(1000)
  const stop = page.locator('.stop-btn')
  await expect(stop, 'Stop shows while moving').toBeVisible()
  // In the page: where you are when Stop is pressed, and the last frame you moved.
  await page.evaluate(() => {
    const w = document.querySelector('#world')
    const at = () => ({ x: Number(w.dataset.px), z: Number(w.dataset.pz) })
    const k = { down: 0, from: null, last: null, lastAt: 0 }
    window.__k12 = k
    document.querySelector('.stop-btn').addEventListener('pointerdown', () => { k.down = performance.now(); k.from = at(); k.last = at(); k.lastAt = k.down }, { once: true })
    const watch = () => {
      if (k.down) { const p = at(); if (p.x !== k.last.x || p.z !== k.last.z) { k.last = p; k.lastAt = performance.now() } }
      if (!k.done) requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
  })
  const speedBefore = await page.evaluate(() => window.mzansiWalkPace().now)
  await tapOn(page, f, stop)
  await page.waitForTimeout(1500)
  const k = await page.evaluate(() => { window.__k12.done = true; return window.__k12 })
  // (from the press reaching the game to the last frame that moved)
  const stillAfter = Math.round(k.lastAt - k.down)
  const drift = Math.hypot(k.last.x - k.from.x, k.last.z - k.from.z)
  const hidden = await stop.isHidden()
  await page.screenshot({ path: `${OUT}/K12-stopped.png` })
  console.log('K12', JSON.stringify({ speedBefore, stillAfterMs: stillAfter, stopDistance: +drift.toFixed(3), stopHidden: hidden, state: await read.state(page) }))
  expect(speedBefore, 'was moving').toBeGreaterThan(1)
  expect(stillAfter, 'standing still within 0.4 s').toBeLessThan(400)
  expect(drift, 'within 0.3 m of where Stop was tapped').toBeLessThan(0.3)
  expect(hidden, 'Stop hides once standing').toBe(true)
  await saveVideo(page, 'K12-stop')
})

test('K13 tap behind something solid: the player gives up within 2 s, never pushes into it', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
  await page.waitForTimeout(1200)
  // The biggest solid thing near you (a stage, a stall, a counter), and a spot just
  // behind it, on the far side from you.
  const spot = await page.evaluate(() => {
    const p = window.mzansiPlayerPos()
    const near = window.mzansiColliders().filter((c) => Math.hypot(c.cx - p.x, c.cz - p.z) < 14 && c.hx * c.hz > 0.6).sort((a, b) => b.hx * b.hz - a.hx * a.hz)
    for (const c of near) {
      const dx = c.cx - p.x
      const dz = c.cz - p.z
      const d = Math.hypot(dx, dz) || 1
      const r = Math.max(c.hx, c.hz) + 0.5
      const x = c.cx + (dx / d) * r
      const z = c.cz + (dz / d) * r
      const s = window.mzansiScreenOf(x, z, 0)
      if (s && !s.behind && s.x > 30 && s.x < 382 && s.y > 170 && s.y < 780) return { x, z, s, kind: c.kind }
    }
    return null
  })
  expect(spot, 'something solid on screen to tap behind').toBeTruthy()
  await f.tap(spot.s.x, spot.s.y)
  // Pushing is "walking" while getting nowhere.
  let pushing = 0
  let worst = 0
  let last = await read.pos(page)
  for (let t = 0; t < 40; t++) {
    await page.waitForTimeout(250)
    const p = await read.pos(page)
    const st = await read.state(page)
    if (['walking', 'running'].includes(st) && dist(p, last) < 0.02) pushing += 250
    else pushing = 0
    worst = Math.max(worst, pushing)
    last = p
  }
  const end = await read.pos(page)
  await page.screenshot({ path: `${OUT}/K13-wall.png` })
  console.log('K13', JSON.stringify({ behind: spot.kind, worstPushingMs: worst, endState: await read.state(page), offTarget: +dist(end, spot).toFixed(2) }))
  expect(worst, 'never pushes into it for 2 s').toBeLessThan(2000)
  expect(await read.state(page)).toBe('free')
  await saveVideo(page, 'K13-wall')
})
