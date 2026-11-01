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
  if (process.env.DEBUG_T) for (const c of out) console.log(c.phase, c.rows.map((r) => `${JSON.stringify(r.feet)} h${r.hips} y${r.y}`).join(' | '))
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
  await expect.poll(() => page.evaluate(([w]) => window.mzansiBodies(w, 'player')[0]?.phase, [where]), { timeout: 150000, intervals: [200] }).toBe(phase)
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
