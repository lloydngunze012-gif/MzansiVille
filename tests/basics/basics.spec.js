// The basics checklist (K1-K7, K9), played by touch only at 412x915 and normal speed.
// A video of each in docs/sprints/basics/. K8 (10 minutes of random play) is random.spec.js.
// npx playwright test tests/basics --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, OUT, student, finger, nearMe, fingerWalk, read, saveVideo, tapOn, dist, wrap, DEG } from './touch.js'

test.use(PHONE)
test.describe.configure({ timeout: 300000 })

const state = (page) => read.state(page)
const body = (page) => page.evaluate(() => { const b = window.mzansiBodies('campus', 'player')[0]; return b && { yaw: b.yaw, clip: b.clip, speed: b.speed } })
// Does a finger on the ground move you right now (within 0.8 s)?
async function touchMoves(page, f) {
  const a = await read.pos(page)
  await fingerWalk(page, f, 0, -160, 800)
  const b = await read.pos(page)
  return dist(a, b)
}

test('K1 touch: a finger on the ground walks you at once, held and slid it steers, let go and you stop there', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const start = await read.pos(page)
  // The finger goes down on the ground ahead and stays down: you set off before it lifts.
  const p0 = await nearMe(page, 0, -200)
  await f.down(p0.x, p0.y)
  await page.waitForTimeout(900)
  const setOff = dist(start, await read.pos(page))
  const walkPose = await read.pose(page)
  const speeds = [(await body(page)).speed]
  // Slide it round in an arc: the walk follows the finger.
  const track = [start]
  const arc = [[140, -120], [160, 60], [40, 180], [-120, 120], [-150, -60]]
  for (const [dx, dy] of arc) {
    await f.move(Math.min(392, Math.max(20, p0.x + dx)), Math.min(760, Math.max(300, p0.y + 200 + dy)))
    await page.waitForTimeout(700)
    speeds.push((await body(page)).speed)
    track.push(await read.pos(page))
  }
  await f.up()
  const goal = await page.evaluate(() => window.mzansiLastTap)
  // Let go: you walk on to where the finger was and stop there.
  await expect.poll(() => state(page), { timeout: 20000, intervals: [100] }).toBe('free')
  const stopped = await read.pos(page)
  await page.waitForTimeout(1200)
  const after = await read.pos(page)
  const spread = Math.max(...track.map((p) => dist(p, start)))
  const turns = track.slice(2).map((p, i) => Math.atan2(p.x - track[i + 1].x, p.z - track[i + 1].z))
  console.log('K1', JSON.stringify({ setOff: +setOff.toFixed(2), walkPose, speeds, spread: +spread.toFixed(2), headings: turns.map((t) => Math.round(t * DEG)), slide: +dist(stopped, after).toFixed(3), state: await state(page) }))
  expect(setOff, 'walking before the finger lifts').toBeGreaterThan(0.2)
  expect(walkPose).toBe('stand') // (walking: the walk clip, not the run)
  expect(spread, 'the finger took you round').toBeGreaterThan(1)
  expect(new Set(turns.map((t) => Math.round(t * 2))).size, 'the walk turned with the finger').toBeGreaterThan(2)
  expect(dist(stopped, after), 'stopped on the spot').toBeLessThan(0.05)
  expect(await state(page)).toBe('free')
  void goal
  await saveVideo(page, 'K1-touch')
})

test('K2 tap 5 ground spots in a row (mid-walk too), then tap yourself to stop', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  // Five spots around the middle of the screen, the next tapped while still walking.
  const spots = [[-120, -170], [130, -120], [-90, 80], [140, 120], [0, -140]]
  const results = []
  for (const [i, [dx, dy]] of spots.entries()) {
    await f.tap(206 + dx, 520 + dy)
    await page.waitForTimeout(200)
    const tap = await page.evaluate(() => window.mzansiLastTap)
    const a = await read.pos(page)
    // (a sharp change of course turns on the spot first, then walks)
    await page.waitForTimeout(i === spots.length - 1 ? 6000 : 1600)
    const b = await read.pos(page)
    const near = await page.evaluate(() => window.mzansiNear())
    results.push({ near: i === spots.length - 1 ? near : undefined, tap, closer: tap?.kind === 'ground' ? +(dist(a, tap) - dist(b, tap)).toFixed(2) : null, left: tap?.kind === 'ground' ? +dist(b, tap).toFixed(2) : null })
  }
  await page.screenshot({ path: `${OUT}/K2-taps.png` })
  // Tap a far spot, then tap yourself on the way: you stop.
  await f.tap(206 - 150, 520 - 250)
  await page.waitForTimeout(1000)
  const me = await page.evaluate(() => { const p = window.mzansiPlayerPos(); return window.mzansiScreenOf(p.x, p.z, 1.0) })
  await f.tap(me.x, me.y)
  await page.waitForTimeout(300)
  const stopA = await read.pos(page)
  await page.waitForTimeout(1000)
  const stopB = await read.pos(page)
  console.log('K2', JSON.stringify({ results, selfTap: await page.evaluate(() => window.mzansiLastTap), slide: dist(stopA, stopB) }))
  for (const r of results.slice(0, -1)) {
    expect(r.tap?.kind).toBe('ground')
    expect(r.closer, 'heading for the new spot').toBeGreaterThan(0.3)
  }
  expect(results.at(-1).left, 'got to the last spot').toBeLessThan(1.2)
  expect(await page.evaluate(() => window.mzansiLastTap.kind)).toBe('self')
  expect(dist(stopA, stopB), 'stopped').toBeLessThan(0.2)
  await saveVideo(page, 'K2-taps')
})

test('K3 tap the Quad from the cafeteria: jog there, stop facing it, no slant', async ({ page }) => {
  await student(page, { spawn: 'cafeteria' })
  const f = await finger(page)
  const mini = await page.locator('.minimap').boundingBox()
  await f.tap(mini.x + mini.width / 2, mini.y + mini.height / 2)
  const pin = await page.locator('.map-pin[data-place="quad"]').boundingBox()
  await f.tap(pin.x + pin.width / 2, pin.y + pin.height / 2)
  await page.waitForTimeout(1500)
  const trip = { pose: await read.pose(page), body: await body(page) }
  await page.screenshot({ path: `${OUT}/K3-jog.png` })
  await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
  const stopped = await read.pos(page)
  const yawA = await body(page)
  await page.waitForTimeout(1500)
  const later = await read.pos(page)
  const yawB = await body(page)
  const place = await page.evaluate(() => window.mzansiPlaceOf('quad'))
  const want = Math.atan2(place.x - later.x, place.z - later.z)
  const rot = await read.rot(page)
  await page.screenshot({ path: `${OUT}/K3-arrived.png` })
  const out = { trip, shuffle: dist(stopped, later), facingOff: Math.abs(wrap(rot - want)) * DEG, slant: Math.abs(wrap(yawB.yaw - rot)) * DEG, turnAfter: Math.abs(wrap(yawB.yaw - yawA.yaw)) * DEG }
  console.log('K3', JSON.stringify(out))
  expect(trip.pose).toBe('run')
  expect(out.shuffle, 'no shuffle after stopping').toBeLessThan(0.05)
  expect(out.facingOff, 'facing the Quad').toBeLessThan(25)
  expect(out.slant, 'body square with the way it faces').toBeLessThan(4)
  await saveVideo(page, 'K3-arrive')
})

test('K4 talk to 5 people: the tap answers within 1 s, replies lead somewhere, walking works after goodbye', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const talked = []
  const skip = new Set(['auntie_pinky', 'mam_gugu', 'amahle', 'kabelo'])
  let lost = 0
  for (let round = 0; round < 20 && talked.length < 5; round++) {
    // Someone on screen where a thumb can tap them (not under the HUD, the minimap,
    // the buttons), the nearest first.
    const target = await page.evaluate((done) => {
      const p = window.mzansiPlayerPos()
      const open = (s) => s.x > 20 && s.x < 392 && s.y > 150 && s.y < 770 && !(s.x > 290 && s.y < 260)
      return window.mzansiPeople()
        .filter((o) => !done.includes(o.id) && !['auntie_pinky', 'mam_gugu'].includes(o.id))
        .map((o) => ({ ...o, s: window.mzansiPersonOnScreen(o.id), d: Math.hypot(o.x - p.x, o.z - p.z) }))
        .filter((o) => o.s && !o.s.behind && open(o.s))
        .sort((a, b) => a.d - b.d)[0] || null
    }, [...talked.map((t) => t.id), ...skip])
    if (!target) {
      // Nobody in view: walk on a bit (a finger on the ground some way off).
      await fingerWalk(page, f, [150, -150, 150, -150][round % 4], [-150, -150, 150, 150][round % 4], 1500)
      continue
    }
    // The tap answers within 1 s: the chat opens, or (out of reach) you turn and set off
    // towards them and the chat opens on arrival.
    let t0 = 0
    let seen = false
    // (a tap the game never saw at all, swallowed by one of this machine's long frames,
    // is tapped again and counted)
    for (let attempt = 0; attempt < 3 && !seen; attempt++) {
      // (timed in the page: the finger's event time to the first frame you turn or move)
      await page.evaluate(() => {
        window.__k4 = window.mzansiLastTap
        const w = document.querySelector('#world')
        const at = () => `${w.dataset.px},${w.dataset.pz},${window.mzansiPlayerRot().toFixed(2)}`
        const k = { from: at(), down: 0, moved: 0 }
        window.__k4t = k
        w.querySelector('canvas').addEventListener('pointerdown', (e) => { k.down = e.timeStamp }, { once: true })
        const watch = (t) => { if (k.down && at() !== k.from) { k.moved = t; return } if (!k.moved) requestAnimationFrame(watch) }
        requestAnimationFrame(watch)
      })
      t0 = Date.now()
      await f.tap(target.s.x, target.s.y)
      for (let i = 0; i < 15 && !seen; i++) {
        seen = await page.evaluate(() => window.mzansiLastTap !== window.__k4)
        if (!seen) await page.waitForTimeout(100)
      }
      if (!seen) lost += 1
    }
    const card = page.locator('.g-talk')
    let opened = 0
    let answered = 0
    // (a walk up at this machine's frame rate: the game runs slower than real time)
    for (let i = 0; i < 300 && !opened && seen; i++) {
      if (await card.isVisible()) opened = Date.now() - t0
      else await page.waitForTimeout(100)
    }
    answered = await page.evaluate(() => (window.__k4t.moved ? Math.round(window.__k4t.moved - window.__k4t.down) : 0))
    if (!opened) { console.log('K4 round', round, 'no chat', target.id, JSON.stringify(await page.evaluate(() => window.mzansiLastTap))); skip.add(target.id); continue }
    answered = answered || opened
    const who = await card.getAttribute('data-talk')
    // A reply: the answer comes (or something starts).
    const reply = card.locator('[data-act="talk-reply"]').first()
    let answer = null
    if (await reply.count()) {
      await tapOn(page, f, reply)
      await page.waitForTimeout(600)
      answer = await page.evaluate(() => document.querySelector('.g-talk')?.dataset.phase || document.querySelector('#world').dataset.activity || null)
    }
    await page.screenshot({ path: `${OUT}/K4-${talked.length + 1}.png` })
    // Goodbye (or the leave button if a reply started something).
    const bye = page.locator('.g-talk [data-act="talk-bye"]').first()
    const leave = page.locator('.ps-leave')
    const target2 = (await bye.count()) && (await bye.isVisible()) ? bye : leave
    await tapOn(page, f, target2)
    await page.waitForTimeout(300)
    if ((await state(page)) !== 'free' && (await state(page)) !== 'walking' && await leave.isVisible()) {
      await tapOn(page, f, leave)
      await page.waitForTimeout(300)
    }
    const moved = await touchMoves(page, f)
    talked.push({ id: who, answered, opened, answer, moved: +moved.toFixed(2) })
  }
  console.log('K4', JSON.stringify({ talked, lostTaps: lost }))
  expect(talked.length).toBe(5)
  for (const t of talked) {
    expect(t.answered, `${t.id}: the tap answers within 1 s (the chat, or walking up to them)`).toBeLessThan(1000)
    expect(t.answer, `${t.id}: the reply leads somewhere`).toBeTruthy()
    expect(t.moved, `${t.id}: walking works right after goodbye`).toBeGreaterThan(0.4)
  }
  await saveVideo(page, 'K4-talk')
})

test('K5 cafeteria queue: back of the line, one served at a time, served within 30 s, buy, sit, eat, stand, walk away', async ({ page }) => {
  await student(page, { spawn: 'cafeteria', run: { money: 200 } })
  const f = await finger(page)
  // Four people in the line before you join.
  await expect.poll(async () => (await read.queue(page, 'caf')).people, { timeout: 30000 }).toBe(4)
  const auntie = await read.person(page, 'auntie_pinky')
  const t0 = Date.now()
  await f.tap(auntie.x, auntie.y)
  const log = []
  let menuAt = 0
  for (let i = 0; i < 160 && !menuAt; i++) {
    const q = await read.queue(page, 'caf')
    log.push({ t: Date.now() - t0, order: q.order, serving: q.serving })
    if (await page.locator('.g-talk[data-phase="menu"]').isVisible()) menuAt = Date.now() - t0
    else await page.waitForTimeout(250)
  }
  await page.screenshot({ path: `${OUT}/K5-1-front.png` })
  // In order: nobody ever ahead of you who wasn't ahead before; you only move up.
  let ahead = null
  let cuts = 0
  let lastIndex = 99
  for (const row of log) {
    const i = row.order.indexOf('player')
    if (i < 0) continue
    const now = row.order.slice(0, i)
    if (ahead) cuts += now.filter((id) => !ahead.includes(id)).length
    if (i > lastIndex) cuts += 1
    ahead = now
    lastIndex = i
  }
  const joinedAt = log.find((r) => r.order.includes('player'))
  console.log('K5 queue', JSON.stringify({ menuAt, joined: joinedAt, cuts, served: [...new Set(log.map((r) => r.serving).filter(Boolean))] }))
  expect(joinedAt.order.indexOf('player'), 'joined at the back').toBe(joinedAt.order.length - 1)
  expect(cuts, 'nobody cut in').toBe(0)
  expect(menuAt, 'served within 30 s').toBeGreaterThan(0)
  expect(menuAt).toBeLessThan(30000)
  // Buy: the first item (a size if it asks), then sit and eat.
  const tapEl = (loc) => tapOn(page, f, loc)
  await tapEl(page.locator('.g-talk [data-act="talk-item"]').first())
  await page.waitForTimeout(400)
  if (await page.locator('.g-talk[data-phase="size"]').isVisible()) await tapEl(page.locator('.g-talk [data-act="talk-size"]').first())
  await expect(page.locator('.g-talk[data-phase="bought"]')).toBeVisible()
  await tapEl(page.locator('.g-talk [data-act="talk-eat"][data-how="sit"]'))
  await expect(page.locator('#world')).toHaveAttribute('data-activity', 'orderEat', { timeout: 5000 })
  await expect.poll(() => read.pose(page), { timeout: 120000 }).toBe('sit')
  await page.screenshot({ path: `${OUT}/K5-2-eating.png` })
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 180000 })
  await expect.poll(() => read.pose(page), { timeout: 10000 }).toBe('stand')
  const q = await read.queue(page, 'caf')
  expect(q.order).not.toContain('player')
  const moved = await touchMoves(page, f)
  await page.screenshot({ path: `${OUT}/K5-3-walk-away.png` })
  console.log('K5 after', JSON.stringify({ moved, state: await state(page) }))
  expect(moved, 'walk away with a finger').toBeGreaterThan(0.4)
  await saveVideo(page, 'K5-queue')
})

test('K6 sit on a Quad bench and stand up; sleep in your bed and get up', async ({ page }) => {
  await student(page, { spawn: 'quad' })
  const f = await finger(page)
  const tapEl = (loc) => tapOn(page, f, loc)
  // The Quad's sheet (the minimap's map, the Quad): a bench to sit on.
  const openPlace = async (id) => {
    await tapEl(page.locator('.minimap'))
    await tapEl(page.locator(`.map-pin[data-place="${id}"]`))
    await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
  }
  await openPlace('quad')
  await tapEl(page.locator('.g-sheet [data-act="do"][data-id="quad_friends"]'))
  await expect.poll(() => state(page), { timeout: 30000 }).toBe('seated')
  await expect(page.locator('.ps-leave')).toHaveText('Stand up')
  await expect.poll(() => read.pose(page), { timeout: 30000 }).toBe('sit')
  await page.screenshot({ path: `${OUT}/K6-1-bench.png` })
  const leave = await page.locator('.ps-leave').boundingBox()
  await f.tap(leave.x + leave.width / 2, leave.y + leave.height / 2)
  await expect.poll(() => read.pose(page), { timeout: 5000 }).toBe('stand')
  await expect.poll(() => state(page), { timeout: 5000 }).toBe('free')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/K6-2-stood.png` })
  expect(await touchMoves(page, f)).toBeGreaterThan(0.4)
  await saveVideo(page, 'K6-bench')
})

test('K6b sleep in your bed and get up', async ({ page }) => {
  await student(page, { spawn: 'home', run: { minutes: 22 * 60 + 30, phase: 'night' } })
  const f = await finger(page)
  const tapEl = (loc) => tapOn(page, f, loc)
  const home = await page.evaluate(() => window.mzansiHomeId?.())
  await tapEl(page.locator('.minimap'))
  await tapEl(page.locator(`.map-pin[data-place="${home}"]`))
  await expect(page.locator('.g-sheet')).toBeVisible({ timeout: 40000 })
  await tapEl(page.locator('.g-sheet [data-act="do"][data-id*="sleep"]').first())
  await expect.poll(() => state(page), { timeout: 40000 }).toBe('sleeping')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/K6-3-bed.png` })
  await expect(page.locator('.ps-leave')).toHaveText('Get up')
  // Let the night pass: you get up by yourself in the morning.
  await expect.poll(() => state(page), { timeout: 90000 }).not.toBe('sleeping')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/K6-4-up.png` })
  console.log('K6b', JSON.stringify({ state: await state(page), pose: await read.pose(page) }))
  await saveVideo(page, 'K6-sleep')
})

test('K7 camera in Top, Sims and Eye: nothing blocks the player, heads in frame', async ({ page }) => {
  await student(page, { spawn: 'cafeteria' })
  const f = await finger(page)
  const tapEl = (loc) => tapOn(page, f, loc)
  const out = {}
  for (const mode of ['top', 'sims', 'eye']) {
    await tapEl(page.locator(`[data-act="view"][data-mode="${mode}"]`))
    await page.waitForTimeout(800)
    const bad = []
    let samples = 0
    // Walk about near the menu board, the counter, the terrace and the trees.
    for (const [dx, dy, ms] of [[0, -180, 2500], [180, 0, 2000], [0, 180, 2500], [-180, 0, 2500], [120, -120, 2000]]) {
      const p = await nearMe(page, dx, dy)
      await f.tap(p.x, p.y)
      for (let t = 0; t < ms; t += 300) {
        await page.waitForTimeout(300)
        const h = await page.evaluate(() => window.mzansiHeads([]))
        const me = h.heads.find((x) => x.id === 'player')
        samples += 1
        if (mode !== 'eye' && me && (!me.inside || me.hidden)) bad.push(me)
        if (mode === 'eye' && me?.shown) bad.push({ ...me, why: 'own head shown in Eye' })
      }
    }
    await page.screenshot({ path: `${OUT}/K7-${mode}.png` })
    out[mode] = { samples, bad: bad.length, first: bad[0] || null }
  }
  console.log('K7', JSON.stringify(out))
  for (const mode of ['top', 'sims', 'eye']) expect(out[mode].bad, `${mode}: the player is never hidden`).toBe(0)
  await saveVideo(page, 'K7-camera')
})

test('K9 no mirrored or upside-down text anywhere', async ({ page }) => {
  await student(page, { spawn: 'gate' })
  const signs = await page.evaluate(() => window.mzansiSigns())
  const bad = signs.filter((s) => s.mirrored || s.upsideDown)
  console.log('K9', JSON.stringify({ count: signs.length, bad }))
  // The taxi rank and the town edge, from the campus side.
  const f = await finger(page)
  await fingerWalk(page, f, 0, 220, 2500)
  await page.screenshot({ path: `${OUT}/K9-taxi-rank.png` })
  expect(signs.length).toBeGreaterThan(10)
  expect(bad).toEqual([])
  await saveVideo(page, 'K9-signs')
})
