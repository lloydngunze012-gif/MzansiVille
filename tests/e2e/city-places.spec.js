// City job B: the places open. Every door (or lot) opens a Things to do list of ten rows; rows run (time, stats,
// the result line on the result card); the licence and the car; one paid gig a day; hours.
// The two-phone part (friends in Lifecup) is tests/presence/places.spec.js; the short one for the quick project is
// tests/e2e/city-places-quick.spec.js.
// Run: npx playwright test tests/e2e/city-places.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { atGate, city, closeResult, fingerTap, info, leavePlace, money, pickRow, placeNow, rowsOf, run, toDoor } from '../city.js'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(300000)
const SHOTS = 'docs/sprints/places'
mkdirSync(SHOTS, { recursive: true })
const STATS = (extra = {}) => ({ money: 600, energy: 90, grades: 50, social: 30, hunger: 40, ...extra })
// A save that is already standing in SunnyBay, in the Social slot (every one of the 18 places is open then).
const inTown = (extra = {}) => ({ cityAt: { x: 0, z: 150 }, phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: STATS(), ...extra })
async function start(page, patch) {
  const errors = await atGate(page, { patch })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await page.waitForTimeout(500)
  return errors
}

test('P1 all 18 places open a list of exactly 10 rows; each has its staff and patrons, and a way back out', async ({ page }) => {
  const errors = await start(page, inTown())
  const places = await page.evaluate(() => window.mzansiCity.places())
  expect(places.length).toBe(18)
  expect(places.filter((p) => p.template === 'room').length).toBe(6)
  expect(places.filter((p) => p.template === 'hall').length).toBe(6)
  expect(places.filter((p) => p.template === 'open').length).toBe(6)
  const report = []
  for (const p of places) {
    const at = await toDoor(page, p.id)
    await expect(page.locator('.city-todo .ct-row')).toHaveCount(10)
    await expect(page.locator('.city-todo h3')).toContainText(p.name)
    // the sheet covers at most 60% of the screen and is a centred card
    const box = await page.locator('.city-todo').boundingBox()
    expect(box.height).toBeLessThanOrEqual(844 * 0.6 + 1)
    expect(box.width).toBeLessThanOrEqual(420)
    const now = await placeNow(page)
    expect(now.folk.id).toBe(p.id)
    expect(now.folk.n).toBeGreaterThanOrEqual(3) // (one staff, 2 to 4 patrons)
    expect(now.folk.n).toBeLessThanOrEqual(5)
    expect(new Set(now.folk.skins).size).toBeGreaterThanOrEqual(3)
    await page.locator('.city-todo [data-city="todo-close"]').tap()
    await page.waitForTimeout(300)
    const i = await info(page)
    if (p.template === 'open') {
      expect(now.inside).toBe('')
      if (['beach', 'driving_school', 'taxi_rank', 'park', 'stadium', 'petrol'].includes(p.id)) await page.screenshot({ path: `${SHOTS}/open-${p.id}-390.png` })
    } else {
      expect(now.inside).toBe(p.id)
      await expect(page.locator('body')).toHaveAttribute('data-city-place', p.id)
      await page.screenshot({ path: `${SHOTS}/${p.template}-${p.id}-390.png` })
      await leavePlace(page)
      // back out at the same door
      const back = await info(page)
      expect(Math.hypot(back.player[0] - at.door.x, back.player[1] - at.door.z)).toBeLessThan(6)
    }
    report.push(`${p.id} ${p.template} ${i.calls} draws ${Math.round(i.triangles / 1000)}k tris${now.room ? ` (room ${Math.round(now.room.tris)} tris)` : ''}`)
  }
  console.log(report.join('\n'))
  expect(errors).toEqual([])
})

test('P2 a meal at the Mall: money drops, fullness rises, the result line shows on the result card', async ({ page }) => {
  const errors = await start(page, inTown())
  await toDoor(page, 'mall')
  await page.screenshot({ path: `${SHOTS}/things-to-do-390.png` })
  const before = await run(page)
  await pickRow(page, 'mall_eat_at_the_food_court')
  await expect(page.locator('.city-result')).toContainText('A kota and a juice, eaten at a high table, tray taken back without being asked.')
  await expect(page.locator('.city-result h2')).toHaveText('Eat at the food court')
  await expect(page.locator('.city-result .rc-gains')).toContainText('Fullness +36')
  await page.screenshot({ path: `${SHOTS}/result-meal-390.png` })
  const after = await run(page)
  expect(Math.floor(after.stats.money)).toBe(Math.floor(before.stats.money) - 45)
  expect(after.stats.hunger).toBe(before.stats.hunger + 36)
  expect(Math.abs(after.stats.energy - before.stats.energy - 4)).toBeLessThan(1.5) // (the walk to the door costs a little too)
  // a quick row is a third of a slot: this one opened a slot, two more quick ones ride in it
  expect(after.slotsLeft).toBe(before.slotsLeft - 1)
  expect(after.minutes).toBe(before.minutes + 25)
  expect(after.counts.activity.mall_eat_at_the_food_court).toBe(1)
  await closeResult(page)
  await expect(city(page)).toHaveAttribute('data-card', 'todo:mall')
  await pickRow(page, 'mall_walk_the_windows')
  await closeResult(page)
  await pickRow(page, 'mall_get_measured')
  await closeResult(page)
  expect((await run(page)).slotsLeft).toBe(before.slotsLeft - 1)
  // the top bar shows the new money
  await expect(page.locator('.tb-stat').filter({ hasText: '555' })).toBeVisible()
  expect(errors).toEqual([])
})

test('P3 one paid city gig a day: the second is refused with the reason', async ({ page }) => {
  const errors = await start(page, inTown())
  await toDoor(page, 'mall')
  const before = await money(page)
  await pickRow(page, 'mall_hand_out_samples')
  await expect(page.locator('.city-result')).toContainText('The sample cups run out')
  expect(await money(page)).toBe(before + 140)
  await closeResult(page)
  const floor = page.locator('.ct-row[data-row="mall_work_the_mall_floor"]')
  await expect(floor).toHaveClass(/off/)
  await expect(floor).toHaveAttribute('data-why', 'gig')
  await expect(floor.locator('.ct-why')).toHaveText('One city gig a day. Back tomorrow.')
  await floor.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/greyed-row-390.png` })
  await fingerTap(page, floor) // (a tap on a greyed row says why and does nothing)
  await page.waitForTimeout(600)
  await expect(page.locator('.city-result')).toBeHidden()
  expect(await money(page)).toBe(before + 140)
  // a gig somewhere else is refused the same day too
  await leavePlace(page)
  await toDoor(page, 'lifecup')
  expect((await rowsOf(page, 'lifecup')).filter((r) => r.why === 'gig').length).toBe(2)
  expect(errors).toEqual([])
})

test('P4 yard lesson, road lesson, the test, the first car, and a drive to the Beach', async ({ page }) => {
  const errors = await start(page, inTown({ phase: 'lecture', minutes: 9 * 60 + 10, lectureResolved: true, stats: STATS({ money: 6000 }) }))
  await toDoor(page, 'driving_school')
  // the order is enforced
  const rows = await rowsOf(page, 'driving_school')
  expect(rows.find((r) => r.name === 'Take the road lesson').why).toBe('lesson')
  expect(rows.find((r) => r.name === 'Take the licence test').why).toBe('lesson')
  await pickRow(page, 'driving_school_take_the_yard_lesson')
  await closeResult(page)
  await pickRow(page, 'driving_school_take_the_road_lesson')
  await closeResult(page)
  await pickRow(page, 'driving_school_take_the_licence_test')
  await expect(page.locator('.city-result')).toContainText('The card is yours.')
  await expect(page.locator('.city-result')).toContainText("driver's licence")
  await page.screenshot({ path: `${SHOTS}/licence-result-390.png` })
  await closeResult(page)
  let r = await run(page)
  expect(r.licence).toBe(true)
  expect(Math.floor(r.stats.money)).toBe(6000 - 180 - 220 - 450)
  expect((await rowsOf(page, 'driving_school')).find((x) => x.name === 'Take the licence test').why).toBe('owned')
  await page.locator('.city-todo [data-city="todo-close"]').tap()
  // the dealership: the first car
  await toDoor(page, 'dealership')
  await pickRow(page, 'dealership_buy_the_first_car')
  await expect(page.locator('.city-result')).toContainText('An old, honest little car')
  await closeResult(page)
  r = await run(page)
  expect(r.car.id).toBe('first')
  expect(r.carAt).toBe('dealership')
  expect(Math.floor(r.stats.money)).toBe(6000 - 850 - 4500)
  await leavePlace(page)
  await expect(city(page)).toHaveAttribute('data-car', /^dealership:/)
  await page.evaluate(() => window.mzansiCity.cam('sims'))
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${SHOTS}/car-parked-390.png` })
  // job A's driving now works for a real player: the map, Drive, R8, the car parked at the Beach
  const cash = await money(page)
  await page.locator('[data-city="map"]').tap()
  await page.locator('.cm-pin[data-pin="beach"]').tap()
  await expect(page.locator('.cm-detail [data-way="drive"]')).toBeEnabled()
  await page.locator('.cm-detail [data-way="drive"]').tap()
  await expect(city(page)).toHaveAttribute('data-car', /^beach:/, { timeout: 30000 })
  await expect(city(page)).toHaveAttribute('data-part', 'beachfront')
  expect(await money(page)).toBe(cash - 8)
  expect((await run(page)).carAt).toBe('beach')
  expect(errors).toEqual([])
})

test('P5 without the licence the car rows are greyed, with the reason', async ({ page }) => {
  const errors = await start(page, inTown({ stats: STATS({ money: 20000 }) }))
  await toDoor(page, 'dealership')
  for (const id of ['dealership_buy_the_first_car', 'dealership_buy_the_used_runabout']) {
    const row = page.locator(`.ct-row[data-row="${id}"]`)
    await expect(row).toHaveClass(/off/)
    await expect(row).toHaveAttribute('data-why', 'licence')
    await expect(row.locator('.ct-why')).toHaveText("Needs a driver's licence")
  }
  await page.locator('.ct-row[data-row="dealership_buy_the_first_car"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${SHOTS}/greyed-car-rows-390.png` })
  await fingerTap(page, page.locator('.ct-row[data-row="dealership_buy_the_first_car"]'))
  await page.waitForTimeout(500)
  expect((await run(page)).car).toBeFalsy()
  await leavePlace(page)
  // the petrol station's car rows need a car of your own
  await toDoor(page, 'petrol')
  expect((await rowsOf(page, 'petrol')).filter((r) => r.why === 'car').map((r) => r.name).sort()).toEqual(['Buy the fancy tank and the deluxe wash', 'Stay in for the roller wash', 'Wash your own car twice'])
  expect(errors).toEqual([])
})

test('P7 outside its hours a door says when it opens; later today you can skip to it', async ({ page }) => {
  const errors = await start(page, inTown({ phase: 'lecture', minutes: 10 * 60, lectureResolved: true }))
  // the Lounge opens at Social
  await toDoor(page, 'lounge', { sheet: false })
  await expect(city(page)).toHaveAttribute('data-card', 'closed:lounge', { timeout: 30000 })
  await expect(page.locator('.city-card')).toContainText('Closed now')
  await expect(page.locator('.city-card')).toContainText('Opens Social 13:00')
  await page.screenshot({ path: `${SHOTS}/closed-door-390.png` })
  await page.locator('.city-card [data-city="wait"]').tap()
  await expect(city(page)).toHaveAttribute('data-card', 'todo:lounge', { timeout: 30000 })
  expect((await run(page)).phase).toBe('social')
  await leavePlace(page)
  // at night the Bank is shut until tomorrow
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); s.run.phase = 'night'; s.run.minutes = 21 * 60 + 10; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) })
  await page.reload()
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await toDoor(page, 'bank', { sheet: false })
  await expect(city(page)).toHaveAttribute('data-card', 'closed:bank', { timeout: 30000 })
  await expect(page.locator('.city-card')).toContainText('Opens tomorrow, Morning 07:00')
  await expect(page.locator('.city-card [data-city="wait"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('P8 every interior holds 30 fps at 4x CPU throttle; draw calls and triangles per template', async ({ page }) => {
  const errors = await start(page, inTown())
  const places = (await page.evaluate(() => window.mzansiCity.places())).filter((p) => p.template !== 'open')
  const cdp = await page.context().newCDPSession(page)
  const sample = () => page.evaluate(() => new Promise((resolve) => {
    let n = 0
    const t0 = performance.now()
    const step = (t) => { n++; if (t - t0 >= 2500) resolve(Math.round((n / ((t - t0) / 1000)) * 10) / 10); else requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }))
  const out = {}
  for (const p of places) {
    await toDoor(page, p.id)
    await page.locator('.city-todo [data-city="todo-close"]').tap()
    const now = await placeNow(page)
    // (walking, as a player would be: across the room to the counter)
    await page.evaluate(([x, z]) => window.mzansiCity.walkTo(x, z), [now.room.focus.x, now.room.focus.z])
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.waitForTimeout(800)
    const all = [await sample(), await sample(), await sample()].sort((a, b) => a - b)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const i = await info(page)
    out[p.id] = { template: p.template, fps: all[1], calls: i.calls, triangles: i.triangles, roomTriangles: Math.round(now.room.tris), people: now.folk.n + 1 }
    console.log(`PLACE FPS (4x CPU throttle) ${p.id} ${p.template}: ${all[1]} fps (samples ${all.join(', ')}), ${i.calls} draws, ${i.triangles} tris (room ${Math.round(now.room.tris)})`)
    await leavePlace(page)
  }
  writeFileSync(`${SHOTS}/fps-4x.json`, JSON.stringify(out, null, 2))
  for (const [id, v] of Object.entries(out)) expect(v.fps, `${id} fps`).toBeGreaterThanOrEqual(28)
  expect(errors).toEqual([])
})

for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`P9 the places' cards at ${size.width} px: the sheet, the closed door and the result are centred cards with readable text`, async ({ page }) => {
    await page.setViewportSize(size)
    const errors = await start(page, inTown({ phase: 'lecture', minutes: 10 * 60, lectureResolved: true }))
    const check = async (sel, name, { micro = 'small, .cc-kind, .rc-eyebrow, .rc-gain, .rc-cost', maxH } = {}) => {
      const box = await page.locator(sel).boundingBox()
      expect(box.width, `${name} width`).toBeLessThanOrEqual(440.5)
      expect(box.x, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(size.width + 0.5)
      expect(Math.abs(box.x + box.width / 2 - size.width / 2), `${name} centred`).toBeLessThan(2)
      if (maxH) expect(box.height, `${name} height`).toBeLessThanOrEqual(size.height * maxH + 1)
      const small = await page.locator(sel).evaluate((el, m) => [...el.querySelectorAll('*')].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => [n.textContent.trim().slice(0, 24), parseFloat(getComputedStyle(n).fontSize), Boolean(n.closest(m))]).filter(([, px, tiny]) => px < (tiny ? 11 : 14)), micro)
      expect(small, `${name} small text`).toEqual([])
      await page.screenshot({ path: `${SHOTS}/p9-${size.width}-${name}.png` })
    }
    await toDoor(page, 'lounge', { sheet: false })
    await expect(city(page)).toHaveAttribute('data-card', 'closed:lounge', { timeout: 30000 })
    await check('.city-card', 'closed')
    await page.locator('.city-card [data-city="close"]').tap()
    await toDoor(page, 'lifecup')
    await check('.city-todo', 'sheet', { maxH: 0.6 })
    await pickRow(page, 'lifecup_eat_a_muffin')
    await check('.city-result', 'result')
    await closeResult(page)
    expect(errors).toEqual([])
  })
}

test('P6 a show-off is bought once, saved, and listed on your full player card (the latest three, newest first)', async ({ page }) => {
  const errors = await start(page, inTown({ stats: STATS({ money: 5000 }) }))
  await toDoor(page, 'lifecup')
  await pickRow(page, 'lifecup_put_the_upstairs_on_your_tab')
  await expect(page.locator('.city-result')).toContainText('It shows on your player card now.')
  await closeResult(page)
  const tab = page.locator('.ct-row[data-row="lifecup_put_the_upstairs_on_your_tab"]')
  await expect(tab).toHaveAttribute('data-why', 'owned')
  await expect(tab.locator('.ct-why')).toHaveText('Already yours')
  expect((await run(page)).showoffs.map((s) => s.name)).toEqual(['Put the upstairs on your tab'])
  await leavePlace(page)
  await toDoor(page, 'bank')
  await pickRow(page, 'bank_rent_a_small_safe_box_for_the_year')
  await closeResult(page)
  expect(await money(page)).toBe(5000 - 1000 - 2400)
  await leavePlace(page)
  // your full card
  await page.locator('[data-act="gear"]').first().tap() // (the menu, as a player would: Student card)
  await page.locator('.g-menu [data-go="profile"]').tap()
  await expect(page.locator('.pcard .pc-flex')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.pcard .pc-flex .pc-badge')).toHaveText([/Rent a small safe box for the year/, /Put the upstairs on your tab/])
  await page.screenshot({ path: `${SHOTS}/card-show-offs-390.png` })
  expect(errors).toEqual([])
})
