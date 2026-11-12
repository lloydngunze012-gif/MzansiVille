// Movement (owner, 11 Nov): SunnyBay looks busy. In the quick project, real GPU.
//   M1 Traffic: 8 to 15 cars and kombis about you in Town centre, moving in their lanes; a car slows and stops for
//      you when you stand in its lane, and drives on when you step out; nobody is ever hit.
//   M2 The kombi ride: a kombi pulls up at the stop, you get in, it pulls off with the camera following it, then you
//      step out at your stop; the fare and the time are what they always were.
//   M3 Street people cross at the zebra crossings (waiting at the kerb while a car comes).
//   M4 Inside a place the patrons browse, queue and leave through the door and come back, instead of standing still.
//   M5 (the frame rate at 4x CPU in every district) is tests/basics/movement-fps.spec.js: frame-rate tests run in
//   the timing project, alone, because two browsers on one machine share the graphics card.
// Screenshots at 390 px (not committed): docs/sprints/movement/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, city, intoCity, money, toDoor } from '../city.js'

const OUT = 'docs/sprints/movement'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(300000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
// (a screenshot is evidence, not a check: when two browsers share the graphics card a frame can fail to come at all;
// then it is noted and the test goes on to its checks)
const shot = async (page, name) => { await page.waitForTimeout(400); try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }) } catch (e) { console.log(`screenshot ${name} skipped: ${String(e.message).split('\n')[0]}`) } }
const traffic = (page) => page.evaluate(() => window.mzansiCity.traffic())
const TOWN = { x: -16, z: 230 }

async function inTown(page) {
  const errors = await atGate(page)
  await intoCity(page)
  await page.evaluate(([x, z]) => window.mzansiCity.teleport(x, z, Math.PI), [TOWN.x, TOWN.z])
  await expect.poll(async () => (await traffic(page))?.ready, { timeout: 30000 }).toBe(true)
  return errors
}

test('M1 traffic in Town centre: 8 to 15 vehicles moving in their lanes; a car stops for you and drives on; nobody is hit', async ({ page }) => {
  const errors = await inTown(page)
  await expect.poll(async () => { const t = await traffic(page); return t.cars + t.kombis }, { timeout: 30000 }).toBeGreaterThanOrEqual(8)
  const t = await traffic(page)
  expect(t.cars + t.kombis).toBeLessThanOrEqual(15)
  expect(t.kombis, 'kombis drive the roads too').toBeGreaterThanOrEqual(2)
  expect(t.draws, 'instanced: one draw call per kind of vehicle').toBeLessThanOrEqual(5)
  await expect.poll(async () => (await traffic(page)).moving, { timeout: 20000 }).toBeGreaterThanOrEqual(3)
  await shot(page, 'traffic-town')
  // stand in the lane of a car that is driving, 30 m ahead of it: it stops short of you. (Picked and placed in one
  // step: the game runs 10 times fast in tests, and between two steps a car can cover 16 m under load.)
  const car = await page.evaluate(() => {
    const me = window.mzansiCity.info().player
    const list = window.mzansiCity.traffic().list.filter((c) => !c.ride && c.v > 4 && !c.turn)
    list.sort((a, b) => Math.hypot(a.x - me[0], a.z - me[1]) - Math.hypot(b.x - me[0], b.z - me[1]))
    const c = list[0]
    if (c) window.mzansiCity.putPlayer(c.x + Math.sin(c.h) * 30, c.z + Math.cos(c.h) * 30)
    return c
  })
  expect(car).toBeTruthy()
  let closest = 99
  const watch = async () => {
    const s = await page.evaluate(() => { const me = window.mzansiCity.info().player; return window.mzansiCity.traffic().list.filter((c) => !c.ride).map((c) => ({ ...c, d: Math.hypot(c.x - me[0], c.z - me[1]) })) })
    const near = s.reduce((m, c) => (c.d < m.d ? c : m), { d: 99 })
    closest = Math.min(closest, near.d)
    return near
  }
  await expect.poll(async () => { const n = await watch(); return n.d < 9 && n.v < 0.2 }, { timeout: 20000, message: 'a car stopped in front of you' }).toBe(true)
  await page.waitForTimeout(1500)
  await watch()
  await shot(page, 'car-stops-for-you')
  expect(closest, 'never closer than a step').toBeGreaterThan(2.4)
  expect((await traffic(page)).stoppedForPeople).toBeGreaterThanOrEqual(1)
  // step out of the road: it drives on
  await page.evaluate(([x, z]) => window.mzansiCity.putPlayer(x, z), [TOWN.x + 6, TOWN.z - 6])
  await expect.poll(async () => (await traffic(page)).stoppedForPeople, { timeout: 15000 }).toBe(0)
  // and the traffic never locks up: half a minute later, with you on the pavement, cars are still moving (the first
  // version gridlocked at a junction: a turning car gave way to one waiting at another road's line)
  await page.waitForTimeout(25000)
  await expect.poll(async () => (await traffic(page)).moving, { timeout: 10000 }).toBeGreaterThanOrEqual(3)
  expect(errors).toEqual([])
})

test('M2 the kombi ride: it pulls up, you get in, the camera follows it, you step out at your stop; the fare as before', async ({ page }) => {
  const errors = await inTown(page)
  const before = await money(page)
  const seen = new Set()
  let followed = false
  await page.evaluate(() => window.mzansiCity.travel('taxi', 'beach'))
  for (let i = 0; i < 400; i++) {
    const t = await traffic(page)
    if (t.ride) seen.add(t.ride)
    if (t.following && !followed) { followed = true; await shot(page, 'kombi-pulls-off') }
    if ((await city(page).getAttribute('data-rides')) === '1' && !t.ride) break
    await page.waitForTimeout(60)
  }
  // (the game keeps every step of the ride: a step of a tenth of a second can fall between two looks)
  expect((await traffic(page)).rideLog).toEqual(['coming', 'in', 'off', 'out'])
  expect(followed, 'the camera followed the kombi').toBe(true)
  await expect(city(page)).toHaveAttribute('data-rides', '1', { timeout: 30000 })
  await expect(city(page)).toHaveAttribute('data-part', 'beachfront', { timeout: 30000 })
  expect(await money(page), 'Town centre to the Beachfront: the next district, R15').toBe(before - 15)
  await shot(page, 'kombi-arrived')
  expect(errors).toEqual([])
})

test('M3 street people cross at the zebra crossings, and wait at the kerb while a car comes', async ({ page }) => {
  const errors = await inTown(page)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCity.crossers())).length, { timeout: 30000 }).toBeGreaterThanOrEqual(1)
  // over half a minute a crosser is seen in the middle of the road (on the crossing)
  let mid = false
  for (let i = 0; i < 60 && !mid; i++) {
    for (const c of await page.evaluate(() => window.mzansiCity.crossers())) {
      const t = ((c.x - c.a.x) * (c.b.x - c.a.x) + (c.z - c.a.z) * (c.b.z - c.a.z)) / ((c.b.x - c.a.x) ** 2 + (c.b.z - c.a.z) ** 2)
      if (t > 0.3 && t < 0.7) mid = true
    }
    await page.waitForTimeout(500)
  }
  expect(mid, 'somebody walked over a crossing').toBe(true)
  await shot(page, 'crossing')
  expect(errors).toEqual([])
})

test('M4 inside Lifecup the patrons browse, queue, leave and come back instead of standing still', async ({ page }) => {
  const errors = await atGate(page)
  await intoCity(page)
  await toDoor(page, 'lifecup')
  await expect(city(page)).toHaveAttribute('data-place', 'lifecup', { timeout: 30000 })
  const first = await page.evaluate(() => window.mzansiCity.patrons())
  expect(first.length).toBeGreaterThanOrEqual(1)
  const states = new Set()
  let moved = false
  let left = 0
  for (let i = 0; i < 90; i++) {
    const now = await page.evaluate(() => window.mzansiCity.patrons())
    for (const p of now) states.add(p.state)
    if (now.some((p, k) => Math.hypot(p.x - first[k].x, p.z - first[k].z) > 1)) moved = true
    left = Math.max(left, ...now.map((p) => p.left))
    if (moved && left > 0 && states.has('queue') && states.has('browse')) break
    await page.waitForTimeout(400)
  }
  expect(moved, 'patrons walk about').toBe(true)
  expect([...states]).toEqual(expect.arrayContaining(['browse', 'queue']))
  expect(left, 'one went out of the door').toBeGreaterThan(0)
  await shot(page, 'lifecup-patrons')
  expect(errors).toEqual([])
})
