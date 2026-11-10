// SunnyBay, City job A (owner, 10 Nov). At phone size (390 px), tapped like a player.
//   Y1  walk out of the Main Gate into the city (a tap past the gate, no menu in between), and back in
//   Y2  open the map, tap the Mall pin, take a taxi and arrive at its door; the fare is charged
//   Y3  a player with R5 is refused the taxi and can still walk
//   Y4  a save with a licence and a car drives to the Beach instantly, pays R8, and the car is parked outside
//   Y5  a save without a licence cannot drive
//   Y6  every district: the edges of the world, draw calls and triangles, the screenshots
//   Y7  the city holds 30 fps at 4x CPU throttle
//   Y8  the city's floating cards at 390 and 1280 px (FLOATING CARDS RULE)
// Screenshots (on the PC, not committed): docs/sprints/city/.
// Run: npx playwright test tests/e2e/city.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, city, info, intoCity, money, run, tapWorld } from '../city.js'

const OUT = 'docs/sprints/city'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(300000)

const shot = async (page, name) => { fs.mkdirSync(OUT, { recursive: true }); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }

test('Y1 walk out of the Main Gate into the city, and back in through it', async ({ page }) => {
  const errors = await atGate(page)
  await shot(page, 'y1-campus-gate')
  await intoCity(page)
  await expect(page.locator('#world')).toHaveAttribute('data-on', '0')
  await expect(city(page)).toHaveAttribute('data-part', 'campus')
  const at = await info(page)
  expect(Math.hypot(at.player[0], at.player[1] - 112.5)).toBeLessThan(3)
  await shot(page, 'y1-out-of-the-gate-welcome')
  // no menu in between: no dialog is open, the district chip names where you are
  await expect(page.locator('.city-card')).toBeHidden()
  await expect(page.locator('.city-chip b')).toHaveText('Campus')
  expect((await run(page)).cityAt).toBeTruthy()
  // walk on into Town centre (a border: Main Road)
  await page.evaluate(() => window.mzansiCity.teleport(0, 120, 0))
  await tapWorld(page, 0, 132)
  await expect.poll(async () => (await info(page)).player[1], { timeout: 30000 }).toBeGreaterThan(125.5)
  await expect(city(page)).toHaveAttribute('data-part', 'town')
  await shot(page, 'y1-border-campus-to-town')
  // a reload keeps you in the city
  await page.reload()
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  expect((await info(page)).player[1]).toBeGreaterThan(120)
  // back in through the gate
  await page.evaluate(() => window.mzansiCity.teleport(0, 110, Math.PI))
  await page.waitForTimeout(300)
  await tapWorld(page, 0, 100)
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1')
  const pos = await page.evaluate(() => window.mzansiPlayerPos())
  expect(Math.hypot(pos.x, pos.z - 99)).toBeLessThan(4)
  expect((await run(page)).cityAt).toBeFalsy()
  await shot(page, 'y1-back-on-campus')
  expect(errors).toEqual([])
})

test('Y2 the map: tap the Mall pin, take a taxi, arrive at its door; the fare is charged', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  const before = await money(page)
  const clock = (await run(page)).minutes
  await page.locator('[data-city="map"]').tap()
  await expect(page.locator('.cm-overlay')).toBeVisible()
  await expect(page.locator('.cm-head h2')).toHaveText('SunnyBay')
  await expect(page.locator('.cm-pin')).toHaveCount(19) // 18 places and the campus
  await shot(page, 'y2-map')
  await page.locator('.cm-pin[data-pin="mall"]').tap()
  await expect(page.locator('.cm-detail h3')).toContainText('Mall')
  await expect(page.locator('.cm-detail [data-way="taxi"]')).toContainText('R15')
  await expect(page.locator('.cm-detail [data-way="taxi"]')).toContainText('25 min')
  await expect(page.locator('.cm-detail [data-way="walk"]')).toContainText('Free')
  await shot(page, 'y2-map-mall-pin')
  const t0 = Date.now()
  await page.locator('.cm-detail [data-way="taxi"]').tap()
  // a short walk to the Campus gate stop, the ride (a moment, not a cutscene), the Mall's door
  await expect(city(page)).toHaveAttribute('data-rides', '1', { timeout: 60000 })
  await expect(city(page)).toHaveAttribute('data-card', 'lot:mall')
  const door = await page.evaluate(() => window.mzansiCity.plan.LOTS.find((l) => l.id === 'mall').door)
  const at = await info(page)
  expect(Math.hypot(at.player[0] - door.x, at.player[1] - door.z)).toBeLessThan(3)
  expect(await money(page)).toBe(before - 15)
  expect((await run(page)).minutes).toBe(clock + 25)
  await expect(page.locator('.city-card')).toContainText('Opening soon')
  await expect(city(page)).toHaveAttribute('data-part', 'town')
  console.log(`TAXI from the tap to the Mall's door: ${Date.now() - t0} ms`)
  await shot(page, 'y2-mall-door-opening-soon')
  expect(errors).toEqual([])
})

test('Y3 a player with R5 is refused the taxi and can still walk', async ({ page }) => {
  const errors = await atGate(page, { patch: { money: 5 } })
  await intoCity(page)
  expect(await money(page)).toBe(5)
  // the map says so before you set off
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="mall"]').tap()
  await expect(page.locator('.cm-detail [data-way="taxi"]')).toBeDisabled()
  await expect(page.locator('.cm-detail [data-way="taxi"]')).toContainText('R10 short')
  await expect(page.locator('.cm-detail [data-way="walk"]')).toBeEnabled()
  await page.locator('[data-cm="close"]').tap()
  // at the stop: a friendly line, no fare taken, and "Walk there" walks
  const stop = await page.evaluate(() => window.mzansiCity.plan.STOPS.find((s) => s.id === 'gate'))
  await page.evaluate(([x, z]) => window.mzansiCity.teleport(x + 3, z - 4), [stop.x, stop.z]) // (the stop is a few steps along the road: on screen)
  await page.waitForTimeout(600)
  await tapWorld(page, stop.x, stop.z)
  await expect(city(page)).toHaveAttribute('data-card', 'stop:gate', { timeout: 30000 })
  await shot(page, 'y3-taxi-stop-card')
  await page.locator('.city-card [data-stop="town"]').tap()
  await expect(city(page)).toHaveAttribute('data-card', /^short:/)
  await expect(page.locator('.city-card')).toContainText('nice walk')
  await shot(page, 'y3-refused-friendly')
  expect(await money(page)).toBe(5)
  await expect(city(page)).not.toHaveAttribute('data-rides', '1')
  const from = (await info(page)).player
  await page.locator('.city-card [data-city="walk"]').tap()
  await expect.poll(async () => { const p = (await info(page)).player; return Math.hypot(p[0] - from[0], p[1] - from[1]) }, { timeout: 30000 }).toBeGreaterThan(6)
  expect(await money(page)).toBe(5)
  expect(errors).toEqual([])
})

test('Y4 a licence and a car: the car is parked at res, drives to the Beach instantly for R8 and is parked outside', async ({ page }) => {
  const errors = await atGate(page, { patch: { licence: true, car: { id: 'first' } } })
  // parked outside your house on campus
  await expect.poll(() => page.locator('#world').getAttribute('data-car')).toMatch(/^-?\d/)
  const car = (await page.locator('#world').getAttribute('data-car')).split(',').map(Number)
  await page.evaluate(([x, z]) => window.mzansiCam([x + 9, 7, z + 11], [x, 1, z]), car)
  await shot(page, 'y4-car-parked-at-res')
  await page.evaluate(() => window.mzansiCam(null))
  const before = await money(page)
  const clock = (await run(page)).minutes
  await page.locator('.minimap').tap()
  await page.locator('[data-map="city"]').tap()
  await expect(page.locator('.cm-overlay')).toBeVisible()
  await shot(page, 'y4-map-from-campus')
  await page.locator('.cm-pin[data-pin="beach"]').tap()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toContainText('R8')
  await expect(page.locator('.cm-detail [data-way="drive"]')).toContainText('instant')
  await page.locator('.cm-detail [data-way="drive"]').tap()
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  const door = await page.evaluate(() => window.mzansiCity.plan.LOTS.find((l) => l.id === 'beach').door)
  const at = await info(page)
  expect(Math.hypot(at.player[0] - door.x, at.player[1] - door.z)).toBeLessThan(3)
  expect(await money(page)).toBe(before - 8)
  expect((await run(page)).minutes).toBe(clock) // instant
  expect((await run(page)).carAt).toBe('beach')
  await expect(city(page)).toHaveAttribute('data-car', /^beach:/)
  const parked = (await city(page).getAttribute('data-car')).split(':')[1].split(',').map(Number)
  expect(Math.hypot(parked[0] - door.x, parked[1] - door.z)).toBeLessThan(14)
  await page.locator('.city-card [data-city="close"]').tap()
  await shot(page, 'y4-car-parked-at-the-beach')
  // and from the city: on to the Arcade, the car follows; then home, and it is at res again
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="arcade"]').tap()
  await page.locator('.cm-detail [data-way="drive"]').tap()
  await expect(city(page)).toHaveAttribute('data-car', /^arcade:/)
  expect(await money(page)).toBe(before - 16)
  await page.locator('.city-card [data-city="close"]').tap()
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="campus"]').tap()
  await page.locator('.cm-detail [data-way="drive"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  expect((await run(page)).carAt).toBe('res')
  expect(await money(page)).toBe(before - 24)
  await expect.poll(() => page.locator('#world').getAttribute('data-car')).toMatch(/^-?\d/)
  expect(errors).toEqual([])
})

test('Y5 a save without a licence cannot drive', async ({ page }) => {
  const errors = await atGate(page, { patch: { car: { id: 'first' } } }) // (a car but no licence)
  await expect(page.locator('#world')).toHaveAttribute('data-car', '')
  await page.locator('.minimap').tap()
  await page.locator('[data-map="city"]').tap()
  await page.locator('.cm-pin[data-pin="beach"]').tap()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toBeDisabled()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toContainText('licence')
  await shot(page, 'y5-no-licence')
  await page.locator('[data-cm="close"]').tap()
  await intoCity(page)
  expect(await page.evaluate(() => window.mzansiCity.canDrive())).toBe(false)
  expect(await page.evaluate(() => window.mzansiCity.travel('drive', 'beach').ok)).toBe(false)
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="beach"]').tap()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toBeDisabled()
  expect((await run(page)).carAt).toBeFalsy()
  expect(errors).toEqual([])
})

// Where to stand to see each district, and what else to photograph.
const VIEWS = {
  campus: [0, 112.5, 0], town: [0, 190, 0], suburbs: [0, -170, Math.PI], beachfront: [222, 0, Math.PI / 2], township: [-250, -20, -Math.PI / 2], industrial: [-250, 222, -Math.PI / 2],
}
test('Y6 every district: no void at the edges, draw calls and triangles, screenshots', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  const perf = {}
  for (const [id, [x, z, facing]] of Object.entries(VIEWS)) {
    await page.evaluate(([a, b, c]) => window.mzansiCity.teleport(a, b, c), [x, z, facing])
    await page.waitForTimeout(900)
    await expect(city(page)).toHaveAttribute('data-part', id)
    const row = {}
    for (const cam of ['sims', 'eye', 'top']) {
      await page.evaluate((c) => window.mzansiCity.cam(c), cam)
      await page.waitForTimeout(700)
      const i = await info(page)
      row[cam] = { calls: i.calls, triangles: i.triangles }
      // the lower part of the picture is always city, never bare sky or a void
      const cover = await page.evaluate(() => window.mzansiCity.coverage())
      expect(cover, `${id} ${cam}: ground under the horizon`).toBeGreaterThan(0.97)
      await shot(page, `y6-${id}-${cam}`)
    }
    perf[id] = row
    console.log(`CITY ${id}: sims ${row.sims.calls} draws ${row.sims.triangles} tris · eye ${row.eye.calls} draws ${row.eye.triangles} tris · top ${row.top.calls} draws ${row.top.triangles} tris`)
    expect(row.sims.calls, `${id} draw calls`).toBeLessThan(140)
    await page.evaluate(() => window.mzansiCity.cam('sims'))
  }
  // street people follow the CAST RULE
  const skins = await page.evaluate(() => window.mzansiCity.npcSkins())
  expect(new Set(skins).size).toBeGreaterThanOrEqual(4)
  // the things the report shows: the welcome sign, a billboard, an "Opening soon" door, a wave 2 plot, the sea, the hills
  const pose = async (name, pos, look, far) => { await page.evaluate(([p, l, f]) => window.mzansiCity.shot(p, l, f), [pos, look, far || 0]); await page.waitForTimeout(500); await shot(page, name) }
  await pose('y6-welcome-sign', [1.5, 3.2, 108.5], [0, 2, 119.6])
  await pose('y6-billboard', [-3, 4, 152], [-12, 5.6, 168])
  await pose('y6-door-opening-soon', [-25, 4.5, 216], [-32, 3, 200])
  await pose('y6-wave2-plot', [40, 5, 268], [40, 2, 254])
  await pose('y6-beach-and-sea', [240, 9, 30], [285, 0, -30])
  await pose('y6-hills-from-suburbs', [0, 6, -200], [0, 14, -420])
  await pose('y6-taxi-rank', [-196, 9, 222], [-218, 1, 186])
  await pose('y6-stadium', [-250, 16, 240], [-300, 2, 272])
  await pose('y6-township-street', [-260, 7, 44], [-260, 1.5, -20])
  await pose('y6-bridge-to-township', [-140, 6, 8], [-190, 1, 0])
  await pose('y6-whole-city', [-20, 900, 16], [-20, 0, 15], 3000)
  await page.evaluate(() => window.mzansiCity.shot(null))
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify({ total: (await info(page)).total, perf }, null, 2))
  expect(errors).toEqual([])
})

test('Y7 the city holds 30 fps at 4x CPU throttle', async ({ page }) => {
  await atGate(page)
  await intoCity(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const sample = () => page.evaluate(() => new Promise((resolve) => {
    let n = 0
    const t0 = performance.now()
    const step = (t) => { n++; if (t - t0 >= 3000) resolve(Math.round((n / ((t - t0) / 1000)) * 10) / 10); else requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }))
  const out = {}
  for (const [id, [x, z, facing]] of Object.entries(VIEWS)) {
    await page.evaluate(([a, b, c]) => window.mzansiCity.teleport(a, b, c), [x, z, facing])
    // (walking, as a player would be: a tap a little way ahead)
    await page.evaluate(([a, b]) => window.mzansiCity.walkTo(a, b), [x + (id === 'beachfront' ? 0 : 6), z + (id === 'beachfront' ? 40 : 6)])
    await page.waitForTimeout(1200)
    const all = [await sample(), await sample(), await sample()].sort((a, b) => a - b)
    out[id] = all[1]
    console.log(`CITY FPS (4x CPU throttle) ${id}: ${all[1]} (samples ${all.join(', ')})`)
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/fps-4x.json`, JSON.stringify(out, null, 2))
  for (const [id, fps] of Object.entries(out)) expect(fps, `${id} fps`).toBeGreaterThanOrEqual(28)
})

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`Y8 the city's cards are centred cards at ${size.width} px`, async ({ page }) => {
    await page.setViewportSize(size)
    await atGate(page, { patch: { money: 5 } })
    await intoCity(page)
    const check = async (name) => {
      const box = await page.locator('.city-card').boundingBox()
      expect(box.width, `${name} width`).toBeLessThanOrEqual(440.5)
      expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(size.width + 0.5)
      expect(Math.abs(box.x + box.width / 2 - size.width / 2), `${name} centred`).toBeLessThan(2)
      const small = await page.locator('.city-card').evaluate((el) => [...el.querySelectorAll('*')].filter((n) => n.childNodes.length && [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => [n.className, parseFloat(getComputedStyle(n).fontSize)]).filter(([c, px]) => px < (c === 'cc-kind' ? 11 : 14)))
      expect(small, `${name} small text`).toEqual([])
      await shot(page, `y8-${size.width}-${name}`)
    }
    await page.evaluate(() => window.mzansiCity.goLot('bank'))
    await page.evaluate(() => { const l = window.mzansiCity.plan.LOTS.find((x) => x.id === 'bank'); window.mzansiCity.teleport(l.door.x, l.door.z); window.mzansiCity.goLot('bank') })
    await expect(city(page)).toHaveAttribute('data-card', 'lot:bank')
    await check('door')
    await page.locator('.city-card [data-city="close"]').tap()
    const stop = await page.evaluate(() => window.mzansiCity.plan.STOPS.find((s) => s.id === 'town'))
    await page.evaluate(([x, z]) => window.mzansiCity.teleport(x + 3, z + 4), [stop.x, stop.z])
    await page.waitForTimeout(500)
    await tapWorld(page, stop.x, stop.z)
    await expect(city(page)).toHaveAttribute('data-card', 'stop:town', { timeout: 20000 })
    await check('stop')
    await page.locator('.city-card [data-stop="beachfront"]').tap()
    await expect(city(page)).toHaveAttribute('data-card', /^short:/)
    await check('refused')
    // the map's detail panel
    await page.locator('.city-card [data-city="close"]').tap()
    await page.locator('[data-city="map"]').tap()
    await page.locator('.cm-pin[data-pin="stadium"]').tap()
    const box = await page.locator('.cm-detail').boundingBox()
    expect(box.width).toBeLessThanOrEqual(440.5)
    expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThan(2)
    await shot(page, `y8-${size.width}-map-detail`)
  })
}
