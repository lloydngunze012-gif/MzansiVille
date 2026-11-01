// Motion round 2 finish line (M1-M7) at 412x915 and normal speed. Bodies are
// recorded every rendered frame (window.mzansiRecord) and measured from their
// skinned vertices; every journey saves a video and screenshots in docs/sprints/motion2/.
// One worker: the checks time real motion.
// npx playwright test tests/e2e/motion2.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/motion2'
test.use({ viewport: { width: 412, height: 915 }, video: { mode: 'on', size: { width: 412, height: 915 } } })
test.describe.configure({ timeout: 300000 })

// A new student on campus at 13:00, after the morning and the lecture.
async function campus(page, spawn, extra = '', run = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  const seen = new Set()
  page.on('pageerror', (e) => { if (!seen.has(e.message)) { seen.add(e.message); console.log('PAGE ERROR', e.message, (e.stack || '').split(/\n/).slice(0, 3).join(' | ')) } })
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate((r) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, r)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, run)
  await page.goto(`/?morning=0&spawn=${spawn}${extra}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m === n && m > 0; n = m; return done }, { timeout: 60000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1500)
}

async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const DEG = 180 / Math.PI

// Sideways sliding from consecutive frames: the angle between each step and the way
// the body faces. Only real walking counts (faster than 0.3 m/s).
function crabs(frames, id) {
  const out = []
  const last = new Map()
  for (const f of frames) {
    for (const p of f.people) {
      if (id && p.id !== id) continue
      const key = p.id + (p.id === 'extra' ? `${Math.round(p.x)}` : '')
      const prev = last.get(p.id)
      last.set(p.id, { ...p, t: f.t })
      if (!prev || p.pose === 'sit' || p.pose === 'lie' || key === undefined) continue
      const dx = p.x - prev.x
      const dz = p.z - prev.z
      const dist = Math.hypot(dx, dz)
      const dt = (f.t - prev.t) / 1000
      if (dt <= 0 || dist > 1 || dist / dt < 0.3 || dist < 0.004) continue
      const step = Math.atan2(dx, dz)
      // The body as drawn at the end of the step (headless renders ~6 frames a second,
      // so each frame turns as much as ten phone frames; the step is judged on arrival).
      const facing = p.yaw
      out.push({ id: p.id, deg: Math.abs(wrap(step - facing)) * DEG, speed: dist / dt })
    }
  }
  return out
}

export { campus, saveVideo, crabs, wrap, DEG, OUT }

test('M1 zig-zag across the Quad: no sideways sliding', async ({ page }) => {
  await campus(page, 'quad')
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', every: 0 }))
  // Sharp zig-zag with the stick: 120-degree swings, then a full reverse.
  const legs = [[0.87, 0.5], [-0.87, 0.5], [0.87, 0.5], [-0.87, 0.5], [0, -1], [1, 0], [-1, 0], [0.5, 0.87]]
  let i = 0
  for (const [x, z] of legs) {
    await page.evaluate(([a, b]) => window.mzansiSteer(a, b), [x, z])
    await page.waitForTimeout(2600)
    if (i++ === 3) await page.screenshot({ path: `${OUT}/M1-1.png` })
  }
  await page.evaluate(() => window.mzansiSteer(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/M1-2.png` })
  const frames = await page.evaluate(() => window.mzansiRecordStop())
  const all = crabs(frames)
  const player = all.filter((c) => c.id === 'player')
  const worst = (list) => list.reduce((m, c) => Math.max(m, c.deg), 0)
  const over = all.filter((c) => c.deg > 15)
  console.log('frames', frames.length, 'player steps', player.length, 'worst player', worst(player).toFixed(1), 'everyone steps', all.length, 'worst', worst(all).toFixed(1), 'over 15', over.length, JSON.stringify(over.slice(0, 8)))
  expect(player.length).toBeGreaterThan(40)
  expect(worst(player)).toBeLessThan(15)
  expect(over.length).toBe(0)
  // Soles on the ground for everyone measured on the way.
  const soles = frames.flatMap((f) => f.people.filter((p) => p.sole !== undefined && p.pose !== 'sit' && p.pose !== 'lie').map((p) => ({ id: p.id, gap: p.sole - p.ground })))
  const sunk = soles.filter((s) => Math.abs(s.gap) > 0.02)
  console.log('sole samples', soles.length, 'off', sunk.length, JSON.stringify(sunk.slice(0, 8)))
  expect(sunk.length).toBe(0)
  await saveVideo(page, 'M1-zigzag')
})

// Everyone's soles, sampled from the skinned vertices every few frames.
function soleGaps(frames) {
  return frames.flatMap((f) => f.people.filter((p) => p.sole !== undefined && p.pose !== 'sit' && p.pose !== 'lie' && !p.phase).map((p) => ({ id: p.id, clip: p.clip, gap: +(p.sole - p.ground).toFixed(3), floor: p.floor, x: p.x, z: p.z, y: p.y })))
}

test('M0 feet: everyone on the ground, Quad and cafeteria', async ({ page }) => {
  const off = []
  for (const where of ['quad', 'cafeteria']) {
    await campus(page, where)
    await page.evaluate(() => window.mzansiRecord({ where: 'campus', every: 4 }))
    await page.waitForTimeout(12000)
    const gaps = soleGaps(await page.evaluate(() => window.mzansiRecordStop()))
    const bad = gaps.filter((g) => Math.abs(g.gap) > 0.02)
    console.log(where, 'samples', gaps.length, 'off', bad.length, JSON.stringify(bad.slice(0, 12)))
    off.push(...bad)
  }
  expect(off).toEqual([])
  await saveVideo(page, 'M0-feet')
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

// Planted feet through each sit-down and stand-up: how far each foot travels while
// the hips lower or rise, and how far the body jumps or spins in one frame.
function transitions(frames, id = 'player') {
  const rows = frames.map((f) => ({ t: f.t, ...f.people.find((p) => p.id === id) })).filter((r) => r.id)
  const out = []
  let cur = null
  let prev = null
  for (const r of rows) {
    const phase = r.phase === 'lower' || r.phase === 'rise' ? r.phase : null
    // (a sit-down counts from the last frame of the turn: no jump where the lowering starts)
    if (phase && (!cur || cur.phase !== phase)) { cur = { phase, rows: prev?.phase === 'turn' && prev.feet ? [prev] : [] }; out.push(cur) }
    prev = r
    if (!phase) cur = null
    if (cur) cur.rows.push(r)
  }
  if (process.env.DEBUG_T) for (const c of out) console.log(c.phase, c.rows.map((r) => `${JSON.stringify(r.feet)} h${r.hips} g${r.x},${r.y},${r.z} ry${r.ry}`).join(' | '))
  return out.map((c) => {
    const first = c.rows[0].feet || []
    let drift = 0
    let dip = 0
    let hop = 0
    for (let i = 0; i < c.rows.length; i++) {
      const feet = c.rows[i].feet || []
      feet.forEach((f, k) => { if (first[k]) { drift = Math.max(drift, Math.hypot(f[0] - first[k][0], f[1] - first[k][1], f[2] - first[k][2])); dip = Math.max(dip, Math.abs(f[3] - first[k][3])) } })
      if (i) hop = Math.max(hop, Math.abs((c.rows[i].hips ?? 0) - (c.rows[i - 1].hips ?? 0)))
    }
    return { phase: c.phase, frames: c.rows.length, feetMoved: +drift.toFixed(3), soleMoved: +dip.toFixed(3), hipStep: +hop.toFixed(3), seconds: +((c.rows.at(-1).t - c.rows[0].t) / 1000).toFixed(2) }
  })
}

function expectPlanted(list, what) {
  console.log(what, JSON.stringify(list))
  expect(list.some((t) => t.phase === 'lower'), `${what}: sat down`).toBe(true)
  for (const t of list) {
    expect(t.feetMoved, `${what} ${t.phase}: feet planted`).toBeLessThan(0.03)
    expect(t.frames, `${what} ${t.phase}: animated over several frames`).toBeGreaterThan(3)
  }
}

export { tapPerson, transitions, expectPlanted }

// A screenshot part-way through a sit-down or stand-up.
async function shootPhase(page, phase, name, where = 'campus') {
  await expect.poll(() => page.evaluate(([w]) => window.mzansiBodies(w, 'player')[0]?.phase, [where]), { timeout: 240000, intervals: [200] }).toBe(phase)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test('M4a sit and stand: caf chair (queue at Auntie Pinky, sit and eat)', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=22')
  await tapPerson(page, 'auntie_pinky')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 120000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], feet: ['player'] }))
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await shootPhase(page, 'lower', 'M4-caf-lowering')
  await expect.poll(async () => { const r = await page.evaluate(() => [window.mzansiPlayerPose(), window.mzansiPlayerPos(), document.getElementById('world').dataset.activity]); return r[0] }, { timeout: 150000, intervals: [1000] }).toBe('sit')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/M4-caf-seated.png` })
  if (process.env.DEBUG_T) console.log('seated', JSON.stringify(await page.evaluate(() => window.mzansiBodies('campus', 'player')[0])))
  if (process.env.DEBUG_T) { await page.evaluate(() => window.mzansiRefit()); await page.waitForTimeout(5000); console.log('refit', JSON.stringify(await page.evaluate(() => window.mzansiBodies('campus', 'player')[0]))); console.log('pdata', JSON.stringify(await page.evaluate(() => window.mzansiPlayerData()))) }
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 90000 }).not.toBe('sit')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/M4-caf-up.png` })
  expectPlanted(transitions(await page.evaluate(() => window.mzansiRecordStop())), 'caf chair')
  await saveVideo(page, 'M4-caf-chair')
})

test('M2 up and down the SMIG steps: feet on each step', async ({ page }) => {
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
  await page.evaluate(() => window.mzansiRecord({ where: 'lecture', every: 2 }))
  // The front row: up the stairs from the door, then down the aisle steps to row 1.
  const choices = page.locator('[data-lc="choice"]')
  const n = await choices.count()
  let pick = 0
  for (let i = 0; i < n; i++) if (/front/i.test(await choices.nth(i).innerText())) pick = i
  await choices.nth(pick).tap()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/M2-1-stairs-up.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiBodies('lecture').find((b) => b.id === 'player')?.pose), { timeout: 120000 }).toBe('sit')
  await page.screenshot({ path: `${OUT}/M2-2-seated.png` })
  // The bell: students stand up and walk up the aisle steps and out.
  // (answer the lecture's choice and tap through its lines until the bell)
  for (let i = 0; i < 120; i++) {
    const step = await host.getAttribute('data-step')
    if (/end|done/.test(step || '')) break
    const choice = page.locator('[data-lc="choice"]:visible').first()
    if (await choice.count()) await choice.tap().catch(() => {})
    else await page.locator('.lc-say:visible').first().tap().catch(() => {})
    await page.waitForTimeout(1500)
  }
  await expect(host).toHaveAttribute('data-step', /end|done/, { timeout: 10000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/M2-3-leaving.png` })
  await page.waitForTimeout(6000)
  const frames = await page.evaluate(() => window.mzansiRecordStop())
  const gaps = soleGaps(frames)
  const onSteps = gaps.filter((g) => g.floor > 0.05)
  const heights = new Set(onSteps.map((g) => Math.round(g.floor * 100)))
  const bad = gaps.filter((g) => Math.abs(g.gap) > 0.02)
  console.log('sole samples', gaps.length, 'on steps', onSteps.length, 'step heights', [...heights].sort((a, b) => a - b).map((h) => h / 100).join(','), 'off', bad.length, JSON.stringify(bad.slice(0, 10)))
  expect(onSteps.length).toBeGreaterThan(20)
  expect(heights.size).toBeGreaterThan(5)
  expect(bad).toEqual([])
  await saveVideo(page, 'M2-stairs')
})

test("M5 Eye view: tap Mam' Gugu's tuck shop, straight to the back of the queue, stop cleanly", async ({ page }) => {
  await campus(page, 'quad')
  await page.getByRole('button', { name: /Eye/ }).tap()
  const q = await page.evaluate(() => window.mzansiQueue('stall'))
  // Look at the stall, then tap the stall itself (its counter).
  const counter = { x: q.front.x + (q.vendor.x - q.front.x) * 0.6, z: q.front.z + (q.vendor.z - q.front.z) * 0.6 }
  await page.evaluate(([x, z]) => window.mzansiLookAt(x, z), [counter.x, counter.z])
  await page.waitForTimeout(1500)
  const at = await page.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 0.6), [counter.x, counter.z])
  console.log('queue', JSON.stringify(q), 'stall on screen', JSON.stringify(at))
  await page.screenshot({ path: `${OUT}/M5-1-eye-view.png` })
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'] }))
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(2000)
  console.log('tap', JSON.stringify(await page.evaluate(() => window.mzansiLastTap)))
  await page.screenshot({ path: `${OUT}/M5-2-walking.png` })
  // Arrived: standing at the back of the line (the line then moves up to the counter).
  const back = await page.evaluate(() => window.mzansiQueue('stall').back)
  await expect.poll(async () => { const p = await page.evaluate(() => [window.mzansiPlayerPos(), window.mzansiQueue('stall'), document.getElementById('world').dataset.activity]); if (process.env.DEBUG_T) console.log('m5', JSON.stringify(p)); return Math.hypot(p[0].x - q.back.x, p[0].z - q.back.z) }, { timeout: 90000, intervals: [1000] }).toBeLessThan(0.5)
  await page.screenshot({ path: `${OUT}/M5-3-arrived.png` })
  await page.waitForTimeout(4000)
  const frames = await page.evaluate(() => window.mzansiRecordStop())
  const rows = frames.map((f) => ({ t: f.t, ...f.people[0] })).filter((r) => r.id)
  // The walk: from the tap to the queue, how far it strays from the straight line.
  const start = rows[0]
  const reach = rows.findIndex((r) => Math.hypot(r.x - q.back.x, r.z - q.back.z) < 0.5)
  const path = rows.slice(0, reach + 1)
  const L = Math.hypot(q.back.x - start.x, q.back.z - start.z)
  const stray = Math.max(...path.map((r) => Math.abs(((q.back.x - start.x) * (start.z - r.z) - (start.x - r.x) * (q.back.z - start.z)) / L)))
  // After stopping: no sliding while standing (until the line moves).
  let slide = 0
  for (let i = reach + 1; i < rows.length; i++) {
    if (rows[i].walking || rows[i - 1].walking) continue
    slide = Math.max(slide, Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z))
  }
  const crabs5 = crabs(frames, 'player')
  const worst = crabs5.reduce((m, c) => Math.max(m, c.deg), 0)
  console.log('walk', JSON.stringify({ length: +L.toFixed(2), frames: path.length, strayFromLine: +stray.toFixed(2), endGap: +Math.hypot(rows[reach].x - q.back.x, rows[reach].z - q.back.z).toFixed(2), slideAfterStop: +slide.toFixed(3), worstCrab: +worst.toFixed(1), back, activity: await page.evaluate(() => document.getElementById('world').dataset.activity) }))
  expect(reach).toBeGreaterThan(0)
  expect(slide).toBeLessThan(0.02)
  expect(worst).toBeLessThan(15)
  await saveVideo(page, 'M5-eye-tuckshop')
})

// Through a doorway: sampled every 100 ms, the door must be open before the body
// reaches it, and the body must pass through the gap, never the wall or the frame.
function doorPass(samples, { axis, plane, gap, open }) {
  const across = axis === 'x' ? 'z' : 'x'
  const crossings = []
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    if ((a[axis] - plane) * (b[axis] - plane) > 0 || a[axis] === b[axis]) continue
    // Where the body's middle crossed the door line, and whether the door was open by then.
    const t = (plane - a[axis]) / (b[axis] - a[axis])
    crossings.push({ at: +(a[across] + (b[across] - a[across]) * t).toFixed(2), door: +Math.max(Math.abs(a.door), Math.abs(b.door)).toFixed(2), doorBefore: +Math.abs(a.door).toFixed(2) })
  }
  const near = samples.filter((s) => Math.abs(s[axis] - plane) < 0.45)
  return {
    crossings,
    inFrame: crossings.filter((c) => c.at < gap[0] + 0.25 || c.at > gap[1] - 0.25).length + near.filter((s) => s[across] < gap[0] + 0.25 || s[across] > gap[1] - 0.25).length,
    shutWhileNear: crossings.filter((c) => c.doorBefore < open).length + near.filter((s) => Math.abs(s.door) < open).length,
  }
}

test('M6 through the res door and a lecture venue door: the door opens, no clipping', async ({ page }) => {
  test.setTimeout(600000)
  fs.mkdirSync(OUT, { recursive: true })
  // The res door: day 1 morning, walking to the bus.
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await expect(page).toHaveURL(/#\/morning/)
  await page.goto('/?roommate=1&latebus=0&snooze=0&talk=auto&meet=bus#/morning')
  const host = page.locator('#morning3d')
  const samples = []
  for (let i = 0; i < 600; i++) {
    const step = await host.getAttribute('data-step')
    if (samples.some((q) => q.x > 3.6)) break
    const walkChoice = page.locator('.mm-choice:visible', { hasText: 'Walk to the bus' })
    if (await walkChoice.count()) await walkChoice.first().tap().catch(() => {})
    else if (await page.locator('.mm-choice:visible').count()) await page.locator('.mm-choice:visible').first().tap().catch(() => {})
    else if (await page.locator('.mm-bar:not([hidden]) .mm-go').count()) await page.locator('.mm-bar:not([hidden]) .mm-go').first().tap().catch(() => {})
    else await page.locator('.mm-bubble:visible').first().tap({ timeout: 500 }).catch(() => {})
    // Walking out: sample the doorway every 50 ms until they're through.
    if (step === 'exit') {
      for (let k = 0; k < 300; k++) {
        const q = await page.evaluate(() => { const h = document.getElementById('morning3d').dataset; return { x: Number(h.px), z: Number(h.pz), door: Number(h.door), step: h.step } })
        samples.push(q)
        if (Math.abs(q.x - 2.6) < 0.15) await page.screenshot({ path: `${OUT}/M6-1-res-door.png` })
        if (q.x > 3.6 || q.step !== 'exit') break
        await page.waitForTimeout(50)
      }
    }
    const p = { x: Number(await host.getAttribute('data-px')), z: Number(await host.getAttribute('data-pz')) }
    await page.waitForTimeout(100)
  }
  const res = doorPass(samples, { axis: 'x', plane: 3, gap: [0.6, 1.8], open: 1.2 })
  console.log('res door', JSON.stringify(res))
  expect(res.crossings.length).toBeGreaterThan(0)
  expect(res.inFrame).toBe(0)
  expect(res.shutWhileNear).toBe(0)
  await saveVideo(page, 'M6-res-door')
})

test('M6b through a lecture venue door: the door opens, no clipping', async ({ page }) => {
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
  const hall = []
  for (let i = 0; i < 400; i++) {
    const p = await page.evaluate(() => { const b = window.mzansiBodies?.('lecture', 'player')[0]; return b && { x: b.x, z: b.z, door: window.mzansiHallDoor() } })
    if (p) hall.push(p)
    if (p && Math.abs(p.z - 9.1) < 0.25) await page.screenshot({ path: `${OUT}/M6-2-lecture-door.png` })
    if ((await page.locator('#lecture3d').getAttribute('data-step')) === 'seat') break
    await page.waitForTimeout(100)
  }
  const lec = doorPass(hall, { axis: 'z', plane: 9.1, gap: [4.6 - 0.75, 4.6 + 0.75], open: 1.2 })
  console.log('lecture door', JSON.stringify(lec))
  expect(lec.crossings.length).toBeGreaterThan(0)
  expect(lec.inFrame).toBe(0)
  expect(lec.shutWhileNear).toBe(0)
  await saveVideo(page, 'M6-lecture-door')
})

test('M4b sit and stand: the bus stop bench (day 1 morning)', async ({ page }) => {
  test.setTimeout(600000)
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
  await page.goto('/?roommate=1&latebus=0&snooze=0&talk=auto&meet=bus#/morning')
  const host = page.locator('#morning3d')
  let recording = false
  for (let i = 0; i < 900; i++) {
    const step = await host.getAttribute('data-step')
    if (step === 'walk-stop' && !recording) { await page.evaluate(() => window.mzansiRecord({ where: 'morning', ids: ['player'], feet: ['player'] })); recording = true }
    if (recording && step !== 'walk-stop' && step !== 'stop') break
    const walkChoice = page.locator('.mm-choice:visible', { hasText: 'Walk to the bus' })
    if (await walkChoice.count()) await walkChoice.first().tap().catch(() => {})
    else if (await page.locator('.mm-choice:visible').count()) await page.locator('.mm-choice:visible').first().tap().catch(() => {})
    else if (await page.locator('.mm-bar:not([hidden]) .mm-go').count()) await page.locator('.mm-bar:not([hidden]) .mm-go').first().tap().catch(() => {})
    else await page.locator('.mm-bubble:visible').first().tap({ timeout: 500 }).catch(() => {})
    const b = recording && await page.evaluate(() => window.mzansiBodies('morning', 'player')[0])
    if (b?.phase === 'lower') await page.screenshot({ path: `${OUT}/M4-bus-bench-lowering.png` })
    if (b?.pose === 'sit' && !b.phase) await page.screenshot({ path: `${OUT}/M4-bus-bench-seated.png` })
    await page.waitForTimeout(150)
  }
  const frames = await page.evaluate(() => window.mzansiRecordStop())
  // The walk there never passes through the bench (x 14.9..17.1, z 4.7..5.1): the body's
  // middle never over the bench (standing at its front edge, about to sit, is fine).
  const through = frames.map((f) => f.people[0]).filter((p) => p && p.pose !== 'sit' && !p.phase && p.x > 14.9 && p.x < 17.1 && p.z > 4.7 && p.z < 5.1)
  console.log('through the bench', through.length)
  expect(through.length).toBe(0)
  expectPlanted(transitions(frames), 'bus stop bench')
  await saveVideo(page, 'M4-bus-bench')
})

// Each framing in Top, Sims and Eye: every framed head fully on screen (not under the
// HUD), not hidden behind anything, the camera not inside a head, the player's head shown.
async function headsInThreeViews(page, ids, name) {
  const results = []
  for (const mode of ['top', 'sims', 'eye']) {
    await page.evaluate((m) => window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: m })), mode)
    // (once the camera has glided into the shot)
    await expect.poll(() => page.evaluate(() => { const d = JSON.parse(window.mzansiDebug()); return d.shot?.pos ? Math.hypot(...d.cam.map((v, i) => v - d.shot.pos[i])) : 0 }), { timeout: 20000, intervals: [300] }).toBeLessThan(0.25)
    await page.waitForTimeout(400)
    const r = await page.evaluate((list) => window.mzansiHeads(list), ids)
    await page.screenshot({ path: `${OUT}/M7-${name}-${mode}.png` })
    console.log(name, mode, JSON.stringify(r))
    if (process.env.DEBUG_T) console.log('dbg', await page.evaluate((list) => JSON.stringify({ d: JSON.parse(window.mzansiDebug()), p: window.mzansiPlayerPos(), o: list.map((i) => window.mzansiPersonPos(i)), pose: window.mzansiPlayerPose() }), ids))
    results.push(r)
  }
  for (const r of results) {
    expect(r.close, `${name} ${r.mode}: still the framed shot`).toBe(true)
    expect(r.heads.length, `${name} ${r.mode}: people framed`).toBeGreaterThanOrEqual(ids.length + 1)
    for (const h of r.heads) {
      expect(h.inside && !h.underHud, `${name} ${r.mode}: ${h.id}'s head on screen`).toBe(true)
      expect(h.hidden, `${name} ${r.mode}: ${h.id}'s head not hidden`).toBeNull()
      expect(h.dist, `${name} ${r.mode}: camera not inside ${h.id}'s head`).toBeGreaterThan(0.4)
      expect(h.shown, `${name} ${r.mode}: ${h.id}'s head drawn`).toBe(true)
    }
  }
}

test('M7a heads in frame: a conversation in Top, Sims and Eye', async ({ page }) => {
  await campus(page, 'quad', '&a=21')
  await tapPerson(page, 'x12')
  await expect(page.locator('.g-talk')).toBeVisible({ timeout: 30000 })
  await headsInThreeViews(page, ['x12'], 'talk')
  await saveVideo(page, 'M7-talk')
})

test('M7b heads in frame: studying together in Top, Sims and Eye', async ({ page }) => {
  await campus(page, 'quad', '&a=23')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.locator('[data-kind="study"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 150000 }).toBe('sit')
  await page.waitForTimeout(800)
  await headsInThreeViews(page, ['near'], 'study')
  await saveVideo(page, 'M7-study')
})

test('M7c heads in frame: eating in Top, Sims and Eye', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=22')
  await tapPerson(page, 'auntie_pinky')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 120000 })
  await expect(card).toHaveAttribute('data-phase', 'menu')
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 150000 }).toBe('sit')
  await page.waitForTimeout(1500)
  await headsInThreeViews(page, [], 'eat')
  await saveVideo(page, 'M7-eat')
})

test('M3 into bed, sleep, get up next morning (res), planted', async ({ page }) => {
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
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], feet: ['player'] }))
  await page.locator('[data-act="do"][data-id="sleep"]').tap()
  await shootPhase(page, 'lower', 'M3-1-sitting-on-bed')
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('lie')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/M3-2-lying.png` })
  const lying = await page.evaluate(() => window.mzansiBodies('campus', 'player')[0])
  console.log('lying', JSON.stringify({ bedGap: lying.bedGap }))
  expect(Math.abs(lying.bedGap)).toBeLessThan(0.03)
  // The night passes: the day's summary, then Start day 2 wakes you in the same bed.
  await expect.poll(async () => {
    if (await page.getByRole('button', { name: /Start day 2/ }).first().isVisible()) return true
    const next = page.locator('.g-result button[data-act="dismiss"], [data-screen-card] button[data-act="dismiss"]').first()
    if (await next.isVisible()) await next.tap({ timeout: 2000 }).catch(() => {})
    return false
  }, { timeout: 90000, intervals: [1500] }).toBe(true)
  await page.getByRole('button', { name: /Start day 2/ }).tap()
  await shootPhase(page, 'rise', 'M3-3-getting-up')
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 120000 }).toBe('stand')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/M3-4-up.png` })
  expectPlanted(transitions(await page.evaluate(() => window.mzansiRecordStop())), 'res bed')
  await saveVideo(page, 'M3-bed')
})

test('M4c sit and stand: a Quad bench (Sit with them)', async ({ page }) => {
  await campus(page, 'quad', '&a=21')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], feet: ['player'] }))
  await card.locator('[data-kind="sit"]').tap()
  await shootPhase(page, 'lower', 'M4-quad-bench-lowering')
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 60000 }).toBe('sit')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/M4-quad-bench-seated.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 120000 }).not.toBe('sit')
  await page.waitForTimeout(2500)
  expectPlanted(transitions(await page.evaluate(() => window.mzansiRecordStop())), 'Quad bench')
  await saveVideo(page, 'M4-quad-bench')
})

test('M4d sit and stand: a library chair (Let\'s study)', async ({ page }) => {
  await campus(page, 'quad', '&a=23')
  await tapPerson(page, 'x12')
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 30000 })
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], feet: ['player'] }))
  await card.locator('[data-kind="study"]').tap()
  await shootPhase(page, 'lower', 'M4-library-lowering')
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 150000 }).toBe('sit')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/M4-library-seated.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 150000 }).not.toBe('sit')
  await page.waitForTimeout(2500)
  expectPlanted(transitions(await page.evaluate(() => window.mzansiRecordStop())), 'library chair')
  await saveVideo(page, 'M4-library-chair')
})
