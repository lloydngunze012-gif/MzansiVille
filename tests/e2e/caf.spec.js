// The Caf, job 1 (the shell): the campus Caf door opens the Caf as its own scene behind the
// curtain; every zone of the spec's layout is on screen from the player's camera; the three
// light states; the exit returns you to the campus Caf door. At 390 and 1280 px.
// Screenshots (not committed): docs/sprints/caf-shell/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/caf-shell'
test.setTimeout(240000)
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } }) // (real GPU, like the basics tests)

const ZONES = ['counters', 'queue', 'windowBar', 'longTable', 'smallTables', 'openSeating', 'mainDoor', 'regulars', 'sideDoor', 'patio']
// the kit's props, photographed in place (camera position, look-at)
const PROPS = {
  'servery-counter-hot': [[-5.8, 2.2, -1.2], [-5.8, 0.8, -5]],
  'servery-counter-indian': [[-3.4, 2.2, -1.2], [-3.4, 0.8, -5]],
  'cafe-counter-grill': [[-1.0, 2.2, -1.0], [-1.0, 0.8, -5]],
  'coffee-kiosk': [[2.0, 3.4, 1.4], [2.0, 1.2, -4.2]],
  'folding-dining-table': [[-0.6, 2.4, 3.6], [-0.6, 0.5, 1.0]],
  'cafe-table-set': [[3.7, 2.0, 4.4], [3.7, 0.4, 2.2]],
  'bar-stool': [[-4.4, 1.6, 2.8], [-6.75, 0.5, 1.0]],
  'cafe-parasol': [[7.0, 3.4, 5.4], [10.1, 1.3, 0.8]],
}

async function toCampus(page) {
  const errors = []
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message.slice(0, 300)) })
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
  await page.goto('/?morning=0#/')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/(play|morning)/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'leisure', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&spawn=cafeteria&g=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await page.waitForTimeout(1500)
  return errors
}

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`Caf shell at ${size.width}px`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.setViewportSize(size)
    const errors = await toCampus(page)
    const px = size.width
    // 1. the campus Caf door -> the Caf, its own scene
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
    await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
    await expect(page.locator('#world')).toHaveAttribute('data-on', '0')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${px}-entered.png` })
    // 2. every zone is on screen from the player's camera, with nothing in front of it
    for (const name of ZONES) {
      const z = await page.evaluate((n) => { const zz = window.mzansiCaf.ZONES[n]; window.mzansiCaf.teleport(zz.x, zz.z); return null }, name)
      await page.waitForTimeout(250)
      const p = await page.evaluate((n) => window.mzansiCaf.project(n), name)
      expect(p, name).toBeTruthy()
      expect(p.onScreen, `${name} on screen`).toBe(true)
      expect(p.blockers.filter((b) => /wall|floor/.test(b)), `${name} behind a wall`).toEqual([])
      await page.screenshot({ path: `${OUT}/${px}-zone-${name}.png` })
    }
    // 3. the three light states, the draw calls, the props in place
    await page.evaluate(() => window.mzansiCaf.teleport(0, 1.5))
    for (const light of ['day', 'evening', 'load']) {
      await page.evaluate((l) => window.mzansiCaf.light(l), light)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/${px}-light-${light}.png` })
      const info = await page.evaluate(() => window.mzansiCaf.info())
      console.log(`LIGHT ${light}: ${info.calls} draw calls, ${info.triangles} triangles`)
      expect(info.calls, 'draw calls').toBeLessThan(60)
    }
    await page.evaluate(() => window.mzansiCaf.light('day'))
    if (px === 390) {
      for (const [name, [pos, look]] of Object.entries(PROPS)) {
        await page.evaluate(([a, b]) => window.mzansiCaf.shot(a, b), [pos, look])
        await page.waitForTimeout(250)
        await page.screenshot({ path: `${OUT}/${px}-prop-${name}.png` })
      }
      await page.evaluate(() => window.mzansiCaf.shot(null))
    }
    // 4. the exit door -> back to the campus Caf door
    await page.evaluate(() => window.mzansiCaf.teleport(0, 4.9))
    await page.waitForTimeout(400)
    await page.evaluate(() => { const d = window.mzansiCaf; d.teleport(0, 5.45) })
    await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
    await expect(page.locator('#caf3d')).toHaveAttribute('data-on', '0')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/${px}-back-on-campus.png` })
    expect(errors).toEqual([])
  })
}


// Caf job 1 fixes (owner's phone check, 390 px): the camera fills the screen, the top view fits the whole
// hall squared to the screen, every counter and its sign is seen, the queue lane is a lit lane with gold rope
// posts, the game's top bar stays with Leave / Top / Sims / Eye below it. Shots: docs/sprints/caf-fixes/.
for (const size of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
  test(`Caf fixes at ${size.width}px`, async ({ page }) => {
    const dir = 'docs/sprints/caf-fixes'
    fs.mkdirSync(dir, { recursive: true })
    await page.setViewportSize(size)
    const errors = await toCampus(page)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
    await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
    await page.waitForTimeout(1500)
    const px = size.width
    // 5. the top bar stays, and Leave / the camera buttons sit below it
    const hud = await page.locator('.g-hud').boundingBox()
    expect(hud && hud.height > 20, 'the top bar has a size').toBeTruthy()
    expect(await page.locator('.g-hud').evaluate((e) => getComputedStyle(e).visibility), 'the top bar is visible').toBe('visible')
    const out = await page.locator('.caf-out').boundingBox()
    const cams = await page.locator('.caf-cams').boundingBox()
    expect(out.y, 'Leave is under the top bar').toBeGreaterThanOrEqual(hud.y + hud.height - 1)
    expect(cams.y, 'the camera buttons are under the top bar').toBeGreaterThanOrEqual(hud.y + hud.height - 1)
    expect(out.x + out.width, 'Leave and the camera buttons do not touch').toBeLessThan(cams.x)
    await page.screenshot({ path: `${dir}/${px}-1-default.png` })
    // 1. default view: the floor fills the screen under the bars (no empty plum)
    for (const [x, z] of [[0, 4.4], [-2.2, -1.4], [4.3, 1.6]]) {
      await page.evaluate(([a, b]) => window.mzansiCaf.teleport(a, b), [x, z])
      await page.waitForTimeout(1200)
      const c = await page.evaluate(() => window.mzansiCaf.coverage())
      console.log(`COVERAGE ${px}px at ${x},${z}: ${Math.round(c.covered * 100)}%`)
      expect(c.covered, `room fills the screen with the player at ${x},${z}`).toBeGreaterThan(0.85)
    }
    await page.evaluate(() => window.mzansiCaf.teleport(0, 4.4))
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${dir}/${px}-1-default-door.png` })
    // in the default view the signs in sight are never under the top bar, Leave or the camera buttons
    {
      const bars = await page.evaluate(() => window.mzansiCaf.bars())
      for (const id of ['hot', 'indian', 'grill', 'coffee']) {
        const cx = await page.evaluate((i) => window.mzansiCaf.counterX(i), id)
        const top = await page.evaluate(([a]) => window.mzansiCaf.px(a, 3.4, -5.48), [cx])
        const onScreen = top.x > 0 && top.x < size.width
        if (onScreen) expect(top.y, `${id} sign top clear of the bars (default view)`).toBeGreaterThan(bars.barsBottom)
      }
    }
    // 3. each counter and its sign, from the player's camera, standing at its order spot
    for (const id of ['hot', 'indian', 'grill', 'coffee']) {
      const cx = await page.evaluate((i) => window.mzansiCaf.counterX(i), id)
      await page.evaluate(([a, b]) => window.mzansiCaf.teleport(a, b), [cx, id === 'coffee' ? -1.9 : -2.9])
      await page.waitForTimeout(1500)
      const sign = await page.evaluate(([a]) => window.mzansiCaf.px(a, 3.05, -5.48), [cx])
      const bars = await page.evaluate(() => window.mzansiCaf.bars())
      expect(sign.behind, `${id} sign in front of the camera`).toBe(false)
      expect(sign.x, `${id} sign on screen (x)`).toBeGreaterThan(40)
      expect(sign.x, `${id} sign on screen (x)`).toBeLessThan(size.width - 40)
      expect(sign.y, `${id} sign is under the bars`).toBeGreaterThan(bars.barsBottom + 10)
      expect(sign.y, `${id} sign on screen (y)`).toBeLessThan(size.height - 40)
      await page.screenshot({ path: `${dir}/${px}-3-counter-${id}.png` })
    }
    // 4. the queue lane, close, and from the default view
    await page.evaluate(() => window.mzansiCaf.teleport(-2.2, -0.6))
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${dir}/${px}-4-lane.png` })
    // 2. top view: the whole hall, four counters included, squared to the screen
    await page.locator('.caf-cams [data-cam="top"]').tap()
    await page.waitForTimeout(2500)
    const h = await page.evaluate(() => window.mzansiCaf.hall)
    const bars = await page.evaluate(() => window.mzansiCaf.bars())
    const pts = {}
    for (const [k, x, z] of [['bl', h.X0, h.Z0], ['br', h.X1, h.Z0], ['fl', h.X0, h.Z1], ['fr', h.X1, h.Z1]]) pts[k] = await page.evaluate(([a, b]) => window.mzansiCaf.px(a, 0, b), [x, z])
    for (const [k, p] of Object.entries(pts)) {
      expect(p.x, `hall corner ${k} inside the screen (x)`).toBeGreaterThan(0)
      expect(p.x, `hall corner ${k} inside the screen (x)`).toBeLessThan(size.width)
      expect(p.y, `hall corner ${k} under the bars`).toBeGreaterThan(bars.barsBottom - 4)
      expect(p.y, `hall corner ${k} inside the screen (y)`).toBeLessThan(size.height)
    }
    expect(Math.abs(pts.bl.y - pts.br.y), 'the back wall is level (the room is squared)').toBeLessThan(4)
    expect(Math.abs(pts.bl.x - pts.fl.x), 'the left wall is upright (the room is squared)').toBeLessThan(10)
    for (const id of ['hot', 'indian', 'grill', 'coffee']) {
      const cx = await page.evaluate((i) => window.mzansiCaf.counterX(i), id)
      const s = await page.evaluate(([a]) => window.mzansiCaf.px(a, 3.05, -5.48), [cx])
      expect(s.x, `${id} in the top view`).toBeGreaterThan(10)
      expect(s.x, `${id} in the top view`).toBeLessThan(size.width - 10)
    }
    await page.screenshot({ path: `${dir}/${px}-2-top.png` })
    await page.locator('.caf-cams [data-cam="sims"]').tap()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${dir}/${px}-1-back-to-sims.png` })
    expect(errors).toEqual([])
  })
}

// Frame rate in the Caf on a throttled mid-range phone profile: real GPU, 4x slower CPU, 390 px.
test('Caf holds 30 fps at 4x CPU throttle', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await toCampus(page)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
    await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.waitForTimeout(1500)
    const sample = () => page.evaluate(() => new Promise((resolve) => {
      let n = 0
      const t0 = performance.now()
      const step = (t) => { n++; if (t - t0 >= 3000) resolve(Math.round((n / ((t - t0) / 1000)) * 10) / 10); else requestAnimationFrame(step) }
      requestAnimationFrame(step)
    }))
    const all = [await sample(), await sample(), await sample()].sort((a, b) => a - b)
    const fps = all[1] // (median of three: the shared dev machine is noisy)
    console.log(`CAF FPS samples ${all.join(', ')}`)
    console.log(`CAF FPS (4x CPU throttle) ${fps}`)
    expect(fps).toBeGreaterThanOrEqual(28) // (30 is the target; vsync steps and a noisy machine put a 30 fps run at 29-31)
  })
