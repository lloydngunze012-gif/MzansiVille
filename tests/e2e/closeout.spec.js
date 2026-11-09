// Motion close-out at 412x915 and normal speed: walking pace, everything solid, natural
// legs, the Quad bench, the creator's loading. Videos and screenshots in
// docs/sprints/motion2/closeout/. One worker: the checks time real motion.
// npx playwright test tests/e2e/closeout.spec.js --config playwright.edge.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { campus as campusAt } from './motion-helpers.js'

const OUT = 'docs/sprints/motion2/closeout'
test.use({ viewport: { width: 412, height: 915 }, video: { mode: 'on', size: { width: 412, height: 915 } } })
test.describe.configure({ timeout: 300000 })

async function campus(page, spawn, extra = '') {
  fs.mkdirSync(OUT, { recursive: true })
  await campusAt(page, spawn, extra)
}
async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

// From frames recorded every rendered frame: the player's real speed over each stretch,
// the clip, and how well the clip's stride keeps up with the ground (1 = no sliding).
function pace(frames) {
  const rows = frames.map((f) => ({ t: f.t, ...f.people.find((p) => p.id === 'player') })).filter((r) => r.id && r.rate !== undefined)
  const out = []
  for (let i = 3; i < rows.length; i++) {
    const a = rows[i - 3]
    const b = rows[i]
    const dt = b.clock - a.clock // (game time: headless runs slower than the clock)
    if (!(dt > 0)) continue
    const v = Math.hypot(b.x - a.x, b.z - a.z) / dt
    if (v < 0.5 || !b.walking) continue
    out.push({ clip: b.clip, speed: v, stride: b.rate * b.natural, match: (b.rate * b.natural) / v })
  }
  return out
}
// (headless renders ~6 frames a second and game time runs slower than real time, so
// the ground speed is judged against game time: the stride match, not m/s on the clock)
function summary(list) {
  const m = list.map((x) => x.match).sort((a, b) => a - b)
  const median = m[Math.floor(m.length / 2)]
  return { samples: list.length, clips: [...new Set(list.map((x) => x.clip))], medianMatch: +median?.toFixed(2), worstMatch: +Math.max(...m.map((x) => Math.abs(x - 1))).toFixed(2) }
}

test('K1 walking pace: a brisk walk for short trips, a jog past 15 m, feet keeping up', async ({ page }) => {
  await campus(page, 'quad')
  // A short trip: tap the ground about 8 m away.
  // (a spot 6-9 m away with a clear way there)
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], every: 1 }))
  const short = await page.evaluate(() => {
    const p = window.mzansiPlayerPos()
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      window.mzansiWalkTo(p.x + Math.sin(a) * 7, p.z + Math.cos(a) * 7)
      const r = window.mzansiWalkPace()
      if (r.route > 4 && r.route < 10) return r
    }
    return window.mzansiWalkPace()
  })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${OUT}/K1-1-walk.png` })
  const walk = pace(await page.evaluate(() => window.mzansiRecordStop()))
  // A long trip: the map's go-there to the cafeteria.
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], every: 1 }))
  await page.evaluate(() => window.mzansiGoTo('cafeteria'))
  const long = await page.evaluate(() => window.mzansiWalkPace?.())
  await page.waitForTimeout(6000)
  await page.screenshot({ path: `${OUT}/K1-2-jog.png` })
  const jog = pace(await page.evaluate(() => window.mzansiRecordStop()))
  console.log('short trip pace', JSON.stringify(short), JSON.stringify(summary(walk)), 'long trip pace', JSON.stringify(long), JSON.stringify(summary(jog)))
  // (the owner's player.js, 4 Nov: a walk is 2.3 m/s, a jog 4.0)
  expect(short.speed).toBeGreaterThanOrEqual(2.0)
  expect(short.speed).toBeLessThanOrEqual(2.5)
  expect(long.speed).toBeGreaterThan(3)
  expect(summary(walk).clips).toEqual(['Walk'])
  expect(summary(jog).clips).toContain('Run')
  for (const s of [summary(walk), summary(jog)]) expect(Math.abs(s.medianMatch - 1), 'stride keeps up with the ground').toBeLessThan(0.12)
  await saveVideo(page, 'K1-pace')
})

// Walks the player with the stick straight into one of each kind of solid thing, from
// 2 m away, for a few seconds: the body (every skinned vertex) never more than 3 cm
// into anything, and every kind has a collider.
async function intoEach(page, kinds, tag) {
  const all = await page.evaluate(() => window.mzansiColliders())
  const results = []
  for (const kind of kinds) {
    const cands = all.filter((c) => c.kind === kind)
    if (!cands.length) { results.push({ kind, colliders: 0 }); continue }
    const c = cands[0]
    // A start 2 m out from its side, on a clear spot.
    let start = null
    for (let k = 0; k < 12 && !start; k++) {
      const a = (k / 12) * Math.PI * 2
      const r = Math.max(c.hx, c.hz) + 2
      const p = { x: c.cx + Math.sin(a) * r, z: c.cz + Math.cos(a) * r }
      const clear = all.every((o) => Math.hypot(o.cx - p.x, o.cz - p.z) > Math.max(o.hx, o.hz) + 0.6)
      if (clear) start = p
    }
    if (!start) { results.push({ kind, colliders: cands.length, start: 'none clear' }); continue }
    await page.evaluate(([s, t]) => window.mzansiPlace(s.x, s.z, t.cx, t.cz), [start, c])
    await page.waitForTimeout(600)
    const d = Math.hypot(c.cx - start.x, c.cz - start.z)
    await page.evaluate(([x, z]) => window.mzansiSteer(x, z), [(c.cx - start.x) / d, (c.cz - start.z) / d])
    let worst = { inside: 0 }
    for (let i = 0; i < 14; i++) {
      await page.waitForTimeout(400)
      const r = (await page.evaluate(() => window.mzansiInside(['player'])))[0]
      if (r && r.inside > worst.inside) worst = r
    }
    await page.screenshot({ path: `${OUT}/K2-${tag}-${kind.replace(/[^a-z]+/gi, '-')}.png` })
    if (process.env.DEBUG_T && worst.inside > 0.03) console.log('near', kind, JSON.stringify(await page.evaluate(() => window.mzansiNear())))
    await page.evaluate(() => window.mzansiSteer(0, 0))
    const end = await page.evaluate(() => window.mzansiPlayerPos())
    results.push({ kind, colliders: cands.length, gotTo: +Math.hypot(c.cx - end.x, c.cz - end.z).toFixed(2), inside: worst.inside, what: worst.what || null })
  }
  return results
}

test('K2 everything solid: the stick straight into every kind of thing at the Quad and the cafeteria', async ({ page }) => {
  await campus(page, 'quad')
  await page.waitForTimeout(3000) // (the prop models in, their colliders built)
  const kinds = await page.evaluate(() => [...new Set(window.mzansiColliders().map((c) => c.kind))])
  console.log('collider kinds at the Quad', JSON.stringify(kinds))
  const quad = await intoEach(page, ['bench', 'lamp post', 'stage', 'stage step', 'speaker', 'tree_oak', 'tree_palmTall', 'plant_bushLarge', 'stall', 'SRC table', 'notice board'], 'quad')
  await page.evaluate(() => window.mzansiGoTo('cafeteria'))
  await page.waitForTimeout(15000)
  const caf = await intoEach(page, ['caf counter', 'table', 'chair', 'trashcan'], 'caf')
  for (const r of [...quad, ...caf]) console.log('into', JSON.stringify(r))
  for (const r of [...quad, ...caf]) {
    expect(r.colliders, `${r.kind} has a collider`).toBeGreaterThan(0)
    expect(r.inside, `${r.kind}: the body never in it (${r.what})`).toBeLessThan(0.03)
  }
  await saveVideo(page, 'K2-everything-solid')
})

// Knees point ahead (within the normal outward turn) and feet stay near straight, for
// each leg, every frame: walking, standing, sitting down, seated and getting up.
function legReport(frames) {
  const rows = frames.map((f) => f.people.find((p) => p.id === 'player')).filter((r) => r?.legs)
  const by = {}
  for (const r of rows) {
    const state = r.phase || (r.pose === 'sit' ? 'seated' : r.walking ? 'walking' : 'standing')
    for (const side of ['L', 'R']) {
      const l = r.legs[side]
      if (!l) continue
      const k = (by[`${state}.${side}`] ||= { frames: 0, kneeWorst: 0, footWorst: 0 })
      k.frames++
      if (l.knee !== null) k.kneeWorst = Math.max(k.kneeWorst, Math.abs(l.knee))
      if (l.foot !== null) k.footWorst = Math.max(k.footWorst, Math.abs(l.foot))
    }
  }
  return by
}

test('K3 natural legs: knees ahead, feet straight, walking, standing, sitting and getting up', async ({ page }) => {
  await campus(page, 'cafeteria', '&a=22')
  await page.evaluate(() => window.mzansiRecord({ where: 'campus', ids: ['player'], legs: ['player'] }))
  await page.evaluate(() => window.mzansiSteer(0.6, 0.8))
  await page.waitForTimeout(4000)
  await page.evaluate(() => window.mzansiSteer(0, 0))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/K3-1-standing.png` })
  // Sit down at the caf and get up (queue at Auntie Pinky, sit and eat).
  await page.evaluate(() => window.mzansiTalkTo('auntie_pinky'))
  const card = page.locator('.g-talk')
  await expect(card).toBeVisible({ timeout: 150000 })
  await expect(card).toHaveAttribute('data-phase', 'menu', { timeout: 150000 })
  await card.locator('[data-item="bunny"]').tap()
  await card.locator('[data-size="quarter"]').tap()
  await card.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 180000 }).toBe('sit')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/K3-2-seated.png` })
  await expect.poll(() => page.evaluate(() => window.mzansiPlayerPose()), { timeout: 180000 }).not.toBe('sit')
  await page.waitForTimeout(3000)
  const report = legReport(await page.evaluate(() => window.mzansiRecordStop()))
  console.log('legs', JSON.stringify(report))
  for (const [k, v] of Object.entries(report)) {
    expect(v.kneeWorst, `${k}: knee points ahead (not twisted out or in)`).toBeLessThan(35)
    expect(v.footWorst, `${k}: foot near straight`).toBeLessThan(35)
  }
  await saveVideo(page, 'K3-legs')
})

test('K4 the Quad benches: seated people sit (hips on the seat, feet on the floor, knees ahead)', async ({ page }) => {
  await campus(page, 'quad')
  const sitters = (await page.evaluate(() => window.mzansiBodies('campus'))).filter((b) => b.pose === 'sit' && b.id !== 'player')
  const out = []
  for (const b of sitters) {
    const legs = await page.evaluate((id) => window.mzansiLegs(id), b.id)
    const pos = await page.evaluate((id) => window.mzansiPersonPos(id), b.id)
    out.push({ id: b.id, seat: b.y, seatGap: b.seatGap, footGap: b.footGap, legs })
    if (pos && out.length <= 4) {
      // From the side (square to the body), then three-quarters from the front.
      for (const [tag, turn, dist] of [['side', Math.PI / 2, 2.2], ['front', 0.6, 2.6]]) {
        const s2 = Math.sin(pos.rot + turn)
        const c2 = Math.cos(pos.rot + turn)
        await page.evaluate(([v, s, c, d]) => window.mzansiCam([v.x + s * d, v.y + 0.75, v.z + c * d], [v.x, v.y + 0.2, v.z]), [b, s2, c2, dist])
        await page.waitForTimeout(1500)
        await page.screenshot({ path: `${OUT}/K4-${b.id}-${tag}.png` })
      }
    }
  }
  await page.evaluate(() => window.mzansiCam(null))
  for (const r of out) console.log('sitter', JSON.stringify(r))
  for (const r of out) {
    expect(Math.abs(r.seatGap), `${r.id}: hips on the seat`).toBeLessThan(0.03)
    expect(Math.abs(r.footGap), `${r.id}: feet on the floor`).toBeLessThan(0.05)
    for (const side of ['L', 'R']) if (r.legs?.[side]?.knee !== null && r.legs?.[side]) expect(Math.abs(r.legs[side].knee), `${r.id} ${side}: knee ahead, not kneeling`).toBeLessThan(35)
  }
  await saveVideo(page, 'K4-bench-sitters')
})

test('K5 the creator: a loading shimmer while the 3D student loads, never the old flat character', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  // (the character models held back 2.5 s, like a slow phone connection)
  await page.route('**/models/people2/**', async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue() })
  await page.goto('/#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/#/new')
  const stage = page.locator('.cc-stage').first()
  await expect(stage).toBeVisible({ timeout: 20000 })
  const look = () => page.evaluate(() => {
    const s = document.querySelector('.cc-stage')
    const bob = s?.querySelector('.cc-bob')
    const load = s?.querySelector('.cc-loading')
    return { has3d: s?.classList.contains('cc-has3d'), flat: bob ? getComputedStyle(bob).visibility !== 'hidden' : false, shimmer: load ? getComputedStyle(load).display !== 'none' : false, still: Boolean(s?.querySelector('.cc-still')) }
  })
  const early = await look()
  await page.screenshot({ path: `${OUT}/K5-1-loading.png` })
  await expect.poll(async () => (await look()).has3d, { timeout: 60000 }).toBe(true)
  await page.waitForTimeout(800)
  const loaded = await look()
  await page.screenshot({ path: `${OUT}/K5-2-loaded.png` })
  // A new outfit: the flat character never shows while the new look loads.
  const outfits = page.locator('[data-act="avatar"][data-part="outfit"]')
  const seen = []
  if (await outfits.count()) {
    await outfits.nth(1).tap().catch(() => {})
    for (let i = 0; i < 12; i++) { seen.push(await look()); await page.waitForTimeout(250) }
  }
  await page.screenshot({ path: `${OUT}/K5-3-new-outfit.png` })
  console.log('creator', JSON.stringify({ early, loaded, changing: seen }))
  expect(early.flat, 'no flat character while loading').toBe(false)
  // (the default look stands in as a pre-rendered still of the studio's framing; any other look shows the shimmer: render.js)
  expect(early.shimmer || early.still, 'a shimmer or the still while loading').toBe(true)
  expect(loaded.shimmer, 'no shimmer once the student is in').toBe(false)
  expect(seen.every((s) => !s.flat), 'no flat character while a new outfit loads').toBe(true)
  await saveVideo(page, 'K5-creator')
})
