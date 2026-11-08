// Day 1 drop-off and the doors.
// D1: every building's door spot (the gold ring and dots) is inside the fence, clear of every
//     solid, and reachable on the walk graph from just inside the gate; Mzansi House (it backs
//     onto the boundary fence) faces into campus.
// D2: tapping Mzansi House's ring walks you to its door.
// D3: the drop-off: mum never steps into the car and gets back in at the driver's door; campus
//     walkers are never inside the car (arrival, stop, U-turn).
// Run: npx playwright test tests/e2e/doors.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { enrolUI } from '../enrol.js'

test.describe.configure({ mode: 'serial', timeout: 240000 })
const FENCE_R = 103

async function newGame(page, query = '?fast=1&morning=0') {
  await page.goto(`/${query}#/new`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/${query}#/new`)
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/(play|morning)/)
}

test('D1 every door spot is inside the fence, clear and reachable from the gate', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    delete save.run.dropOff
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?fast=1&morning=0&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  const doors = await page.evaluate(() => window.mzansiDoorAudit())
  console.log('DOORS', JSON.stringify(doors.map((d) => [d.id, d.facing, d.x, d.z, d.radius])))
  expect(doors.length).toBeGreaterThanOrEqual(19)
  for (const d of doors) {
    expect(d.radius, `${d.id} door inside the fence`).toBeLessThan(FENCE_R - 3)
    expect(d.solid, `${d.id} door clear of solids`).toBe(false)
    expect(d.blocked, `${d.id} door on open ground`).toBe(false)
    expect(d.reach, `${d.id} door reachable from the gate`).toBe(true)
    expect(d.ends, `${d.id} the route ends on the door`).toBeLessThan(1)
  }
  const mz = doors.find((d) => d.id === 'off_campus')
  expect(mz.facing, 'Mzansi House turns from the fence').not.toBe(0)
  expect(errors).toEqual([])
})

test('D2 tapping Mzansi House on the map walks you to its door', async ({ page }) => {
  await newGame(page)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60 })
    delete save.run.dropOff
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&spawn=quad#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  const door = await page.evaluate(() => window.mzansiDoorOf('off_campus'))
  await page.evaluate(([x, z]) => window.mzansiWalkTo(x, z), [door.x, door.z])
  await expect.poll(async () => {
    const p = await page.evaluate(() => window.mzansiPlayerPos())
    return Math.hypot(p.x - door.x, p.z - door.z)
  }, { timeout: 120000, intervals: [500] }).toBeLessThan(1.2)
})

test('D3 the car and mum keep clear of each other, and of campus walkers', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await newGame(page, '?fast=1&morning=0&talk=auto')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], at: 'gate', dropOff: { style: 'suburban', day: 1 } })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&talk=auto&drop=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // sample every frame in the page: mum and every walker against the car's box
  await page.evaluate(() => {
    const s = { frames: 0, carFrames: 0, mumInside: 0, mumMinGap: 99, walkerInside: 0, worst: null }
    window.__drop = s
    const tick = () => {
      const r = window.mzansiDropoff?.()
      if (r?.car) {
        s.carFrames++
        const c = r.car
        if (r.parent?.visible) {
          const p = r.parent
          const deep = p.x > c.minX + 0.35 && p.x < c.maxX - 0.35 && p.z > c.minZ + 0.35 && p.z < c.maxZ - 0.35
          if (deep) s.mumInside++
          const gap = Math.max(c.minX - p.x, p.x - c.maxX, c.minZ - p.z, p.z - c.maxZ)
          const doorStep = p.x > c.maxX && Math.abs(p.z - ((c.minZ + c.maxZ) / 2 - 0.2)) < 0.5 // (the driver's door: where she gets in and out)
          if (gap > 0 && !doorStep) s.mumMinGap = Math.min(s.mumMinGap, gap)
        }
        for (const a of window.mzansiPeople()) {
          if (a.id === 'player') continue
          if (a.x > c.minX - 0.3 && a.x < c.maxX + 0.3 && a.z > c.minZ - 0.3 && a.z < c.maxZ + 0.3) { s.walkerInside++; s.worst = a }
        }
      }
      s.frames++
      requestAnimationFrame(tick)
    }
    tick()
  })
  const world = page.locator('#world')
  await expect(world).toHaveAttribute('data-dropoff', 'walk', { timeout: 120000 })
  const s = await page.evaluate(() => window.__drop)
  console.log('DROP', JSON.stringify(s), JSON.stringify(await page.evaluate(() => window.mzansiDropoff?.())))
  expect(s.carFrames, 'the car was watched').toBeGreaterThan(30)
  expect(s.mumInside, 'mum inside the car').toBe(0)
  expect(s.walkerInside, 'a walker inside the car').toBe(0)
  expect(s.mumMinGap, 'mum keeps 0.45 m from the car (except at the driver door)').toBeGreaterThan(0.45)
  expect(errors).toEqual([])
})

test('D4 walkers inside the drop-off zone by the gate lodges are moved out at once, and nobody touches the car', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await newGame(page, '?fast=1&morning=0&talk=auto')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], at: 'gate', dropOff: { style: 'suburban', day: 1 } })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?fast=1&morning=0&talk=auto&drop=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForFunction(() => window.mzansiDropoff?.()?.keep, null, { timeout: 30000 })
  // every frame: anyone inside the car's box; and how many walkers sit in the zone
  await page.evaluate(() => {
    const s = { frames: 0, carFrames: 0, touching: 0, placed: 0, blocker: null }
    window.__d4 = s
    const inside = (a, r, pad) => a.x > r.minX - pad && a.x < r.maxX + pad && a.z > r.minZ - pad && a.z < r.maxZ + pad
    window.__d4zone = () => {
      const keep = window.mzansiDropoff?.()?.keep
      return keep ? window.mzansiPeople().filter((a) => a.id !== 'player' && inside(a, keep, 0)).length : 0
    }
    const tick = () => {
      const r = window.mzansiDropoff?.()
      if (r?.car) {
        s.carFrames++
        s.blocker = r.blocker
        for (const a of window.mzansiPeople()) if (a.id !== 'player' && inside(a, r.car, 0.1)) s.touching++
      }
      s.frames++
      requestAnimationFrame(tick)
    }
    tick()
    s.placed = window.mzansiDropWalkers(8).length
  })
  await page.waitForTimeout(1000)
  const left = await page.evaluate(() => window.__d4zone())
  await expect(page.locator('#world')).toHaveAttribute('data-dropoff', 'walk', { timeout: 120000 })
  const s = await page.evaluate(() => window.__d4)
  console.log('D4', JSON.stringify({ ...s, left }))
  expect(s.placed, 'walkers were put in the zone').toBeGreaterThan(0)
  expect(left, 'nobody left in the zone after a second').toBe(0)
  expect(s.carFrames, 'the car was watched').toBeGreaterThan(30)
  expect(s.touching, 'nobody touched the car').toBe(0)
  expect(errors).toEqual([])
})
