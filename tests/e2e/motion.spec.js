// Motion sprint finish line (M1-M7) at 412x915 and normal speed: bodies measured
// from their skinned vertices (window.mzansiBodies), plus a video of each journey
// and screenshots in docs/sprints/motion/ for the owner to watch.
// Run with one worker: the checks time real motion, and a starved headless browser
// renders too few frames for walkers to move.
// npx playwright test tests/e2e/motion.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/motion'
test.use({ viewport: { width: 412, height: 915 }, video: { mode: 'on', size: { width: 412, height: 915 } } })
test.describe.configure({ timeout: 240000 })

// A new student on campus at 13:00, after the morning and the lecture.
async function campus(page, spawn, extra = '') {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto(`/?morning=0&spawn=${spawn}${extra}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // Everyone's model loaded (the count stops growing) and the player is there.
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m === n && m > 0; n = m; return done }, { timeout: 60000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1500)
}

// Keep the journey's video next to its screenshots.
async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

const bodies = (page) => page.evaluate(() => window.mzansiBodies())
const CM = 0.03

test('M6 every outfit, player and NPC: shoes on', async ({ page }) => {
  await campus(page, 'quad')
  const male = ['hoodie', 'shirt', 'organt', 'jacket', 'punk', 'beach'].map((outfit) => ({ gender: 'male', outfit, hair: 'crop', skin: 'brown' }))
  const female = ['hoodie', 'shirt', 'organt', 'jacket', 'dress', 'shweshwe', 'skirt', 'punk'].map((outfit) => ({ gender: 'female', outfit, hair: 'curls', skin: 'deep' }))
  const groups = [['M6-male-1', male.slice(0, 3)], ['M6-male-2', male.slice(3)], ['M6-female-1', female.slice(0, 4)], ['M6-female-2', female.slice(4)]]
  for (const [name, looks] of groups) {
    await page.evaluate((l) => window.mzansiLineup(l), looks)
    const p = await page.evaluate(() => window.mzansiPlayerPos())
    await page.evaluate(([q, n]) => window.mzansiCam([q.x, 1.0, q.z + 3 + n * 2], [q.x, 0.75, q.z + 3]), [p, looks.length])
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }
  // Everyone in the world, the player included: no skin on the feet, soles on the ground.
  const all = await bodies(page)
  console.log('people checked', all.length)
  const bare = all.filter((b) => b.bareFeet).map((b) => b.id)
  expect(bare).toEqual([])
  for (const b of all.filter((x) => x.pose === 'stand')) expect(Math.abs(b.sole - b.ground), b.id).toBeLessThan(CM)
  await saveVideo(page, 'M6')
})

// Tap a person where they are on screen (like a player), else start the chat directly.
async function tapPerson(page, id) {
  const at = await page.evaluate((who) => window.mzansiPersonOnScreen(who), id)
  const ok = at && !at.behind && at.x > 20 && at.x < 392 && at.y > 300 && at.y < 780
  if (ok) await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(600)
  const started = await page.evaluate(() => Boolean(document.getElementById('world').dataset.talking))
  if (!ok || !started) await page.evaluate((who) => window.mzansiTalkTo(who), id)
}

// Side view of a seated body (campus camera), then its measurements.
async function sideOf(page, body, name, scene = 'campus') {
  const a = Math.atan2(1, 0) // 90 degrees: square to the body
  const view = await page.evaluate(([b, sc]) => window.mzansiBodies(sc).find((x) => x.id === b), [body, scene])
  const rot = scene === 'campus' ? await page.evaluate((id) => (id === 'player' ? null : window.mzansiPersonPos(id)?.rot), body) : null
  if (scene === 'campus') {
    const r = rot ?? (await page.evaluate(() => window.mzansiPlayerRot?.() ?? 0))
    const s = Math.sin(r + a)
    const c = Math.cos(r + a)
    await page.evaluate(([v, s, c]) => window.mzansiCam([v.x + s * 2.4, v.y + 0.75, v.z + c * 2.4], [v.x, v.y + 0.25, v.z]), [view, s, c])
    await page.waitForTimeout(1600)
  }
  await page.screenshot({ path: `${OUT}/${name}.png` })
  return view
}

const playerBody = (page) => page.evaluate(() => window.mzansiBodies('campus', 'player')[0])

function expectSeated(b, what) {
  console.log(what, JSON.stringify({ id: b.id, seat: b.y, seatGap: b.seatGap, footGap: b.footGap, sole: b.sole, fit: b.fit, clip: b.walking, hips: b.hips }))
  expect(b.pose, what).toBe('sit')
  expect(Math.abs(b.seatGap), `${what}: hips on the seat`).toBeLessThan(CM)
  expect(Math.abs(b.footGap), `${what}: feet on the floor`).toBeLessThan(0.05)
}

test('M2a sit on a Quad bench (Sit with them)', async ({ page }) => {
  await campus(page, 'quad', '&a=21')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="sit"]').tap()
  await expect.poll(async () => { const r = await page.evaluate(() => [window.mzansiPlayerPose(), window.mzansiPlayerPos(), document.getElementById('world').dataset.activity, document.getElementById('world').dataset.activityStep]); if (process.env.DEBUG_M2) console.log('m2a', JSON.stringify(r)); return r[0] }, { timeout: 60000, intervals: [1000] }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a Quad bench')
  await page.screenshot({ path: `${OUT}/M2-quad-bench.png` })
  await sideOf(page, 'player', 'M2-quad-bench-side')
  for (const b of (await bodies(page)).filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated on the Quad`)
  await saveVideo(page, 'M2-quad-bench')
})

test('M2b sit on a cafeteria chair (queue at Auntie Pinky, sit and eat)', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=22')
  await tapPerson(page, 'auntie_pinky')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 120000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a caf chair')
  await page.screenshot({ path: `${OUT}/M2-caf-chair.png` })
  await sideOf(page, 'player', 'M2-caf-chair-side')
  for (const b of (await bodies(page)).filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated at the caf`)
  await saveVideo(page, 'M2-caf-chair')
})

test('M2c sit on a library chair (Let\'s study)', async ({ page }) => {
  await campus(page, 'quad', '&a=23')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="study"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 90000 }).toBe('sit')
  await page.waitForTimeout(800)
  expectSeated(await playerBody(page), 'player on a library chair')
  await page.screenshot({ path: `${OUT}/M2-library-chair.png` })
  const all = await bodies(page)
  for (const b of all.filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} seated in the library`)
  await saveVideo(page, 'M2-library-chair')
})

test('M2d sit on a lecture bench (day 1 lecture)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { phase: 'lecture', minutes: 8 * 60 + 45, morningDone: true, queue: [], lectureResolved: false, lectureRoute: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&lecture=1&talk=auto#/lecture')
  const host = page.locator('#lecture3d')
  await expect(host).toHaveAttribute('data-step', 'seat', { timeout: 90000 })
  await page.locator('[data-lc="choice"]').nth(2).tap()
  await expect.poll(() => page.evaluate(() => window.mzansiBodies('lecture').find((b) => b.id === 'player')?.pose), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/M2-lecture-bench.png` })
  const all = await page.evaluate(() => window.mzansiBodies('lecture'))
  for (const b of all.filter((x) => x.pose === 'sit')) expectSeated(b, `${b.id} on a lecture bench`)
  await saveVideo(page, 'M2-lecture-bench')
})

function expectLying(b, what) {
  console.log(what, JSON.stringify({ id: b.id, y: b.y, bedGap: b.bedGap, low: b.low, hips: b.hips }))
  expect(b.pose, what).toBe('lie')
  expect(Math.abs(b.bedGap), `${what}: on top of the mattress, not in it`).toBeLessThan(CM)
}

test('M3 night in res: into bed, sleep, get up next morning', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'night', minutes: 22 * 60, lectureResolved: true, eventSeen: true, dailyEventId: null })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&m=3#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.locator('.g-cta [data-act="place-open"]').tap()
  await page.locator('[data-act="do"][data-id="sleep"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'sleep', { timeout: 10000 })
  // Getting in: sit on the edge first, then lie back.
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000, intervals: [50] }).toBe('sit')
  await page.waitForTimeout(150)
  expectSeated(await playerBody(page), 'player on the bed edge')
  await page.screenshot({ path: `${OUT}/M3-1-edge.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/M3-2-lying-back.png` })
  await page.waitForTimeout(1200)
  expectLying(await playerBody(page), 'player in bed')
  await page.screenshot({ path: `${OUT}/M3-3-in-bed.png` })
  await expect.poll(async () => {
    if (await page.getByRole('button', { name: /Start day 2/ }).first().isVisible()) return true
    const next = page.locator('.g-result button[data-act="dismiss"], [data-screen-card] button[data-act="dismiss"]').first()
    if (await next.isVisible()) await next.tap({ timeout: 2000 }).catch(() => {})
    return false
  }, { timeout: 90000, intervals: [1500] }).toBe(true)
  await page.getByRole('button', { name: /Start day 2/ }).tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'wakeUp', { timeout: 20000 })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('lie')
  await page.waitForTimeout(1200)
  expectLying(await playerBody(page), 'player waking in bed')
  await page.screenshot({ path: `${OUT}/M3-4-waking.png` })
  await page.waitForTimeout(1300)
  await page.screenshot({ path: `${OUT}/M3-5-getting-up.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000, intervals: [50] }).toBe('sit')
  await page.waitForTimeout(200)
  expectSeated(await playerBody(page), 'player sitting up on the bed edge')
  await page.screenshot({ path: `${OUT}/M3-6-sitting-up.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 30000 }).toBe('stand')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/M3-7-up.png` })
  await saveVideo(page, 'M3-bed')
})

test('M3b day 1 morning: on the mattress, then a natural get-up', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await expect(page).toHaveURL(/#\/morning/)
  // Back to normal speed for the get-up itself.
  await page.goto('/?roommate=1&latebus=0&snooze=0&talk=auto#/morning')
  await expect(page.locator('#morning3d')).toHaveAttribute('data-step', /greet|wake/, { timeout: 45000 })
  await page.waitForTimeout(2500)
  expectLying((await page.evaluate(() => window.mzansiBodies('morning'))).find((b) => b.id === 'player'), 'player in bed (morning)')
  await page.screenshot({ path: `${OUT}/M3b-1-in-bed.png` })
  await expect(page.locator('#morning3d')).toHaveAttribute('data-wakeup', 'sit', { timeout: 60000 })
  await page.waitForTimeout(300)
  expectSeated((await page.evaluate(() => window.mzansiBodies('morning'))).find((b) => b.id === 'player'), 'player on the bed edge (morning)')
  await page.screenshot({ path: `${OUT}/M3b-2-sitting-up.png` })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${OUT}/M3b-3-up.png` })
  await saveVideo(page, 'M3b-morning')
})

// How far a point is inside a box (positive = inside, by that many metres from the nearest edge).
const depthIn = (p, b) => Math.min(p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z)
// Sample the player (and anyone else) for a while; return the worst overlap with any box.
// untilStill: stop early once the player has stood still for that many seconds
// (the headless browser renders slowly, so game time runs slower than the clock).
async function watchBoxes(page, seconds, boxesOf, who = () => window.mzansiPlayerPos(), untilStill = 0) {
  let worst = { depth: -Infinity }
  const end = Date.now() + seconds * 1000
  let last = null
  let stillSince = Date.now()
  while (Date.now() < end) {
    const [p, boxes] = await page.evaluate(([w, bo]) => [eval(w)(), eval(bo)(window.mzansiObstacles())], [who.toString(), boxesOf.toString()])
    for (const pos of [].concat(p || [])) for (const b of boxes) { const d = depthIn(pos, b); if (d > worst.depth) worst = { depth: d, pos, box: b } }
    const me = [].concat(p)[0]
    if (!last || Math.hypot(me.x - last.x, me.z - last.z) > 0.03) { last = me; stillSince = Date.now() }
    if (untilStill && Date.now() - stillSince > untilStill * 1000) break
    await page.waitForTimeout(100)
  }
  return worst
}

test('M4a walk into a wall: you stop at it, never through', async ({ page }) => {
  await campus(page, 'smig', '&a=41')
  const [me, walls] = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiObstacles().buildings])
  const wall = walls.sort((a, b) => depthIn(me, b) - depthIn(me, a))[0] // the nearest outline
  const c = { x: (wall.minX + wall.maxX) / 2, z: (wall.minZ + wall.maxZ) / 2 }
  const len = Math.hypot(c.x - me.x, c.z - me.z)
  await page.evaluate(([x, z]) => window.mzansiSteer(x, z), [(c.x - me.x) / len, (c.z - me.z) / len])
  const worst = await watchBoxes(page, 30, (o) => o.buildings, undefined, 2)
  await page.screenshot({ path: `${OUT}/M4-wall.png` })
  await page.evaluate(() => window.mzansiSteer(0, 0))
  const after = await page.evaluate(() => window.mzansiPlayerPos())
  console.log('wall', JSON.stringify({ from: me, to: after, worst: worst.depth, wall, near: (await page.evaluate(() => window.mzansiPeople())).filter((p) => Math.hypot(p.x - after.x, p.z - after.z) < 3), props: (await page.evaluate(() => window.mzansiObstacles().props)).filter((b) => depthIn(after, b) > -3) }))
  expect(Math.hypot(after.x - me.x, after.z - me.z), 'walked up to the wall').toBeGreaterThan(1)
  expect(worst.depth, 'never inside a building').toBeLessThan(-0.2)
  expect(worst.depth, 'right up to the wall, no invisible wall').toBeGreaterThan(-0.6)
  await saveVideo(page, 'M4-wall')
})

test('M4b walk into a table: around it or stop, never through', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=42')
  const [me, props, people] = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiObstacles().props, window.mzansiPeople()])
  // A table nobody is sitting at (people at a table keep you a step away, rightly).
  const busy = (b) => people.filter((p) => depthIn(p, b) > -0.3).length
  const table = props.filter((b) => b.maxX - b.minX > 1 && b.maxX - b.minX < 3 && b.maxZ - b.minZ > 0.9).sort((a, b) => busy(a) - busy(b) || depthIn(me, b) - depthIn(me, a))[0]
  const c = { x: (table.minX + table.maxX) / 2, z: (table.minZ + table.maxZ) / 2 }
  // Push straight at it with the stick until you stop.
  const len = Math.hypot(c.x - me.x, c.z - me.z)
  await page.evaluate(([x, z]) => window.mzansiSteer(x, z), [(c.x - me.x) / len, (c.z - me.z) / len])
  const push = await watchBoxes(page, 45, (o) => o.props, undefined, 2)
  await page.screenshot({ path: `${OUT}/M4-table.png` })
  await page.evaluate(() => window.mzansiSteer(0, 0))
  // Then tap the far side: the walk goes round it.
  const now = await page.evaluate(() => window.mzansiPlayerPos())
  const far = { x: 2 * c.x - now.x, z: 2 * c.z - now.z }
  const at = await page.evaluate((p) => window.mzansiScreenOf(p.x, p.z), far)
  let round = { depth: -Infinity }
  if (at && !at.behind && at.x > 10 && at.x < 400 && at.y > 300 && at.y < 780) {
    await page.mouse.click(at.x, at.y)
    round = await watchBoxes(page, 30, (o) => o.props, undefined, 2)
    await page.screenshot({ path: `${OUT}/M4-table-round.png` })
  }
  const end = await page.evaluate(() => window.mzansiPlayerPos())
  console.log('table', JSON.stringify({ me, now, end, table, push: push.depth, round: round.depth, near: (await page.evaluate(() => [...window.mzansiObstacles().props, ...window.mzansiObstacles().buildings])).filter((b) => depthIn(now, b) > -0.8) }))
  expect(push.depth, 'pushing into it: never inside').toBeLessThan(-0.15)
  // Right up to it, unless someone sitting there keeps you a step away.
  const byPerson = (await page.evaluate(() => window.mzansiPeople())).some((p) => Math.hypot(p.x - now.x, p.z - now.z) < 1.1)
  if (!byPerson) expect(push.depth, 'pushing into it: right up to it').toBeGreaterThan(-0.6)
  expect(round.depth, 'walking round: never inside a table').toBeLessThan(-0.15)
  await saveVideo(page, 'M4-table')
})

test('M4c a bed in res: you walk round the furniture to the bed, never through', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'night', minutes: 22 * 60, lectureResolved: true, eventSeen: true, dailyEventId: null })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&m=4#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.locator('.g-cta [data-act="place-open"]').tap()
  await page.locator('[data-act="do"][data-id="sleep"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiObstacles().room.length), { timeout: 30000 }).toBeGreaterThan(3)
  // Until you sit on the bed's edge: never inside the beds, desk, chair or walls
  // (the last half-metre onto the edge itself excepted).
  const path = []
  while ((await page.evaluate(() => window.mzansiPlayerPose())) !== 'sit' && path.length < 400) {
    path.push(await page.evaluate(() => window.mzansiPlayerPos()))
    await page.waitForTimeout(80)
  }
  await page.screenshot({ path: `${OUT}/M4-bed.png` })
  const blocks = await page.evaluate(() => window.mzansiObstacles().room)
  const edge = path[path.length - 1]
  let worst = -Infinity
  for (const p of path) if (Math.hypot(p.x - edge.x, p.z - edge.z) > 0.7) for (const b of blocks) worst = Math.max(worst, depthIn(p, b))
  console.log('bed', JSON.stringify({ steps: path.length, from: path[0], edge, worst }))
  expect(path.length, 'walked to the bed').toBeGreaterThan(5)
  expect(worst, 'never inside furniture').toBeLessThan(-0.1)
  await saveVideo(page, 'M4-bed')
})

test('M5 eat together: your friend walks beside you, sits properly, walks back', async ({ page }) => {
  await campus(page, 'quad', '&a=51')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  const home = await page.evaluate(() => window.mzansiPersonPos('x12'))
  await card.locator('[data-kind="eat"]').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-companion', 'x12')
  // On the way: level with you (not a step behind), a shoulder's width to the side.
  const beside = []
  let shot = false
  for (let i = 0; i < 60; i++) {
    const [me, rot, f, pose] = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiPlayerRot(), window.mzansiCompanion(), window.mzansiPlayerPose()])
    if (!f || pose === 'sit' || (await page.locator('.g-talk').isVisible())) break
    const dx = f.x - me.x
    const dz = f.z - me.z
    const ahead = dx * Math.sin(rot) + dz * Math.cos(rot)
    const side = Math.abs(dx * Math.cos(rot) - dz * Math.sin(rot))
    const moving = await page.evaluate(() => window.mzansiBodies('campus').find((b) => b.id === 'player')?.clip === 'Walk')
    if (moving) beside.push({ ahead: +ahead.toFixed(2), side: +side.toFixed(2) })
    if (moving && !shot && i > 4) { await page.screenshot({ path: `${OUT}/M5-1-beside.png` }); shot = true }
    await page.waitForTimeout(250)
  }
  const level = beside.filter((b) => Math.abs(b.ahead) < 0.7 && b.side > 0.4 && b.side < 1.4).length
  console.log('beside', beside.length, 'level', level, JSON.stringify(beside.slice(0, 12)))
  expect(beside.length, 'walked together').toBeGreaterThan(4)
  expect(level / beside.length, 'beside you most of the way').toBeGreaterThan(0.6)
  // In the line, order, then both sit at one table.
  await expect(card).toBeVisible({ timeout: 120000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await card.locator('[data-item="pap"]').tap()
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(async () => { const c = await page.evaluate(() => window.mzansiCompanion()); if (process.env.DEBUG_M5) console.log('friend', JSON.stringify(c)); return c?.pose }, { timeout: 120000, intervals: [300] }).toBe('sit')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/M5-2-seated.png` })
  const c = await page.evaluate(() => window.mzansiCompanion())
  const friend = (await bodies(page)).filter((b) => b.id === 'x12').sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]
  expectSeated(friend, 'friend seated at the table')
  // Afterwards they walk back to their spot: no jumps.
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 90000 })
  let prev = await page.evaluate(() => window.mzansiPersonPos('x12'))
  let jump = 0
  let walked = 0
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(150)
    const p = await page.evaluate(() => window.mzansiPersonPos('x12'))
    const d = Math.hypot(p.x - prev.x, p.z - prev.z)
    jump = Math.max(jump, d)
    walked += d
    prev = p
    if (i === 12) await page.screenshot({ path: `${OUT}/M5-3-walking-back.png` })
    if (Math.hypot(p.x - home.x, p.z - home.z) < 0.1) break
  }
  console.log('walk back', JSON.stringify({ home, now: prev, walked, jump }))
  expect(jump, 'no jumps on the way back').toBeLessThan(1)
  expect(walked, 'walked back').toBeGreaterThan(2)
  await saveVideo(page, 'M5-eat-together')
})

test('M7 a crowded Quad for 30 s: nobody frozen, nobody through anyone', async ({ page }) => {
  await campus(page, 'quad', '&a=71')
  await page.screenshot({ path: `${OUT}/M7-1.png` })
  const samples = []
  for (let i = 0; i < 60; i++) {
    samples.push(await page.evaluate(() => [performance.now(), window.mzansiBodies('campus')]))
    if (i === 30) await page.screenshot({ path: `${OUT}/M7-2.png` })
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: `${OUT}/M7-3.png` })
  const problems = { frozen: new Set(), slideIdle: [], walkInPlace: [], overlap: [] }
  const [, first] = samples[0]
  const [, last] = samples[samples.length - 1]
  // Nobody frozen: everyone's animation clock keeps running.
  for (const b of first) {
    const end = last.find((x) => x.id === b.id && Math.abs(x.x - b.x) + Math.abs(x.z - b.z) < 60)
    if (end && end.t === b.t && end.lastPosed === b.lastPosed) problems.frozen.add(b.id)
  }
  for (let s = 1; s < samples.length; s++) {
    const [t0, a] = samples[s - 1]
    const [t1, bs] = samples[s]
    for (const b of bs) {
      const prev = a.find((x) => x.id === b.id)
      if (!prev || b.pose === 'sit' || b.pose === 'lie') continue
      const v = Math.hypot(b.x - prev.x, b.z - prev.z) / ((t1 - t0) / 1000)
      // Moving but not walking (sliding); walking but going nowhere (stuck mid-stride).
      if (v > 0.6 && !/Walk|Run/.test(b.clip) && v < 20) problems.slideIdle.push(`${b.id}@${s}:${v.toFixed(1)}`)
      if (/Walk|Run/.test(b.clip) && v < 0.05 && /Walk|Run/.test(prev.clip)) problems.walkInPlace.push(`${b.id}@${s}`)
    }
    // Nobody inside anybody (people standing or walking, under 0.45 m apart).
    const up = bs.filter((b) => b.pose !== 'sit' && b.pose !== 'lie')
    for (let i = 0; i < up.length; i++) for (let j = i + 1; j < up.length; j++) {
      const d = Math.hypot(up[i].x - up[j].x, up[i].z - up[j].z)
      if (d < 0.45) problems.overlap.push(`${up[i].id}+${up[j].id}@${s}:${d.toFixed(2)}`)
    }
  }
  console.log('M7', JSON.stringify({ people: first.length, frozen: [...problems.frozen], slideIdle: problems.slideIdle.slice(0, 10), walkInPlace: problems.walkInPlace.slice(0, 10), overlap: problems.overlap.slice(0, 10) }))
  expect([...problems.frozen], 'nobody frozen').toEqual([])
  expect(problems.slideIdle.length, 'nobody slides along standing still').toBeLessThan(3)
  expect(problems.walkInPlace.length, 'nobody walks on the spot').toBeLessThan(3)
  expect(problems.overlap, 'nobody walks through anyone').toEqual([])
  await saveVideo(page, 'M7-crowded-quad')
})

test('M1 walk across the Quad for 20 s: feet on the ground, no sliding, smooth turns', async ({ page }) => {
  await campus(page, 'quad', '&a=11')
  const me = await page.evaluate(() => window.mzansiPlayerPos())
  // A zig-zag of taps across the Quad, so there are turns.
  const legs = [[6, 4], [-5, 7], [-7, -3], [4, -6], [6, 3]].map(([dx, dz]) => ({ x: me.x + dx, z: me.z + dz }))
  const samples = []
  const start = Date.now()
  let leg = 0
  let shots = 0
  while (Date.now() - start < 22000) {
    const pose = await page.evaluate(() => window.mzansiBodies('campus', 'player')[0])
    samples.push([performance.now ? Date.now() : 0, pose])
    const pos = await page.evaluate(() => window.mzansiPlayerPos())
    const target = legs[leg % legs.length]
    if (samples.length === 1 || Math.hypot(pos.x - target.x, pos.z - target.z) < 0.8 || (samples.length % 25 === 0 && pose.clip === 'Idle')) {
      if (samples.length > 1) leg++
      const t = legs[leg % legs.length]
      const at = await page.evaluate((p) => window.mzansiScreenOf(p.x, p.z), t)
      if (at && !at.behind && at.x > 10 && at.x < 400 && at.y > 290 && at.y < 800) await page.mouse.click(at.x, at.y)
      else await page.evaluate((p) => window.mzansiSteer(0, 0) || null, t)
    }
    if (shots < 4 && samples.length % 40 === 20) await page.screenshot({ path: `${OUT}/M1-${++shots}.png` })
    await page.waitForTimeout(50)
  }
  const walking = samples.filter(([, b]) => /Walk|Run/.test(b.clip))
  const soles = samples.map(([, b]) => b.sole)
  const sliding = walking.filter(([, b]) => b.rate > 0.6 && b.rate < 1.9 && Math.abs(b.rate * b.natural - b.speed) / Math.max(0.3, b.speed) > 0.25)
  let worstTurn = 0
  for (let i = 1; i < samples.length; i++) {
    const d = Math.abs(Math.atan2(Math.sin(samples[i][1].yaw - samples[i - 1][1].yaw), Math.cos(samples[i][1].yaw - samples[i - 1][1].yaw)))
    const dt = (samples[i][0] - samples[i - 1][0]) / 1000
    worstTurn = Math.max(worstTurn, d / Math.max(dt, 0.05))
  }
  console.log('M1 low', JSON.stringify(samples.filter(([, b]) => b.sole < -0.02).map(([, b]) => [b.clip, b.rate, b.speed, b.sole, b.t])))
  console.log('M1', JSON.stringify({ samples: samples.length, walking: walking.length, soleMin: Math.min(...soles), soleMax: Math.max(...soles), sliding: sliding.length, worstTurnRadPerS: +worstTurn.toFixed(2), examples: walking.slice(0, 5).map(([, b]) => [b.speed, b.rate, b.natural]) }))
  expect(walking.length, 'walked for much of the 20 s').toBeGreaterThan(samples.length * 0.35)
  expect(Math.min(...soles), 'feet never sink').toBeGreaterThan(-CM)
  expect(Math.max(...soles), 'feet never float').toBeLessThan(CM)
  expect(sliding.length / walking.length, 'steps match the ground speed').toBeLessThan(0.1)
  expect(worstTurn, 'turns are smooth (no snapping round)').toBeLessThan(12)
  await saveVideo(page, 'M1-quad-walk')
})
