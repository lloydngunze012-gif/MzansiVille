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
  expect(short.speed).toBeGreaterThanOrEqual(1.6)
  expect(short.speed).toBeLessThanOrEqual(1.8)
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
