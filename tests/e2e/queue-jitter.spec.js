// Queue NPCs never vibrate (owner, 6 Nov). At the caf queue and at Mam' Gugu's stall the
// player joins and leaves the line five times quickly (real taps: tap the vendor, tap the
// ground away), then stands right on slot 2 for 10 s. Sampled every 100 ms in the page:
//   - no queue NPC's facing flips more than 90 degrees between samples more than twice
//     in any second;
//   - no NPC ever has two walks at once;
//   - every NPC in the line is settled (no walk) within 3 s of the line stopping (once
//     within 1.5 m of its place: a walk in from the eating spot is long, not stuck).
// Normal speed, the real GPU, a video each in docs/sprints/queue-jitter/. Below 20 fps the
// test is skipped as INCONCLUSIVE (tests/fps.js), so it never counts at a low frame rate.
// Run: npx playwright test tests/e2e/queue-jitter.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { PHONE, student, finger, read } from '../basics/touch.js'

const OUT = 'docs/sprints/queue-jitter'
test.use(PHONE)
test.describe.configure({ mode: 'serial' })

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))

// Open ground on screen a few metres to the side of the line, or behind its back (read
// only: where the finger goes to walk off). Close by, so the tap never lands on a building
// or a door marker across the way.
function awayFromLine(page, which) {
  return page.evaluate((w) => {
    const p = window.mzansiPlayerPos()
    const q = window.mzansiQueueWalks(w)
    const n = Math.max(1, window.mzansiQueue(w).order.length)
    const taken = q.slots.slice(0, n)
    const ax = q.slots[1].x - q.slots[0].x
    const az = q.slots[1].z - q.slots[0].z
    const al = Math.hypot(ax, az) || 1
    const px = -az / al
    const pz = ax / al
    const cands = []
    for (const r of [3, 3.5, 4, 2.5, 5]) for (const k of [1, -1]) cands.push([p.x + px * r * k, p.z + pz * r * k])
    const back = q.slots[Math.min(5, n + 2)]
    cands.push([back.x + px * 2, back.z + pz * 2], [back.x - px * 2, back.z - pz * 2], [back.x, back.z])
    for (const [x, z] of cands) {
      if (taken.some((sl) => Math.hypot(sl.x - x, sl.z - z) < 1.5)) continue
      const s = window.mzansiScreenOf(x, z, 0)
      if (s && !s.behind && s.x > 40 && s.x < 372 && s.y > 320 && s.y < 740 && window.mzansiOpen(x, z)) return { x, z, s }
    }
    return null
  }, which)
}

// The clear part of the phone screen: below the HUD, above the buttons, off the edges.
const onScreen = (p) => Boolean(p) && !p.behind && p.x > 30 && p.x < 382 && p.y > 300 && p.y < 760
// Walk towards a world point until it is in the clear part of the screen: tap the furthest
// open ground on the way that is (read only: where the finger goes).
async function approach(page, f, target) {
  for (let k = 0; k < 10; k++) {
    const at = await target()
    if (onScreen(await read.screenOf(page, at.x, at.z, 0))) return true
    const step = await page.evaluate(([tx, tz]) => {
      const p = window.mzansiPlayerPos()
      for (const k of [0.85, 0.7, 0.55, 0.4, 0.25]) {
        const x = p.x + (tx - p.x) * k
        const z = p.z + (tz - p.z) * k
        const s = window.mzansiScreenOf(x, z, 0)
        if (s && !s.behind && s.x > 30 && s.x < 382 && s.y > 300 && s.y < 760 && window.mzansiOpen(x, z)) return s
      }
      return null
    }, [at.x, at.z])
    if (step) await f.tap(step.x, step.y)
    await page.waitForTimeout(2500)
  }
  const at = await target()
  return onScreen(await read.screenOf(page, at.x, at.z, 0))
}

// A card open (her order card at the front of the line, a place sheet) holds the player
// still: close it like a player would (Goodbye, or the sheet's close), before walking off.
async function closeCards(page, f) {
  for (const sel of ['.g-talk [data-act="talk-bye"]', '.g-sheet [data-act="close-sheet"]']) {
    const b = page.locator(sel).first()
    if (await b.isVisible().catch(() => false)) {
      const box = await b.boundingBox()
      if (box) { await f.tap(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500) }
    }
  }
}

// Where to tap the vendor: the highest point of her (head, then shoulders, chest) that is
// clear of everyone in the line on screen, so the tap lands on her, not on someone
// standing in front of her (that opens their chat). Read only.
function vendorPoint(page, which, vendor) {
  return page.evaluate(([w, id]) => {
    const v = window.mzansiPersonPos(id)
    const q = window.mzansiQueueWalks(w)
    const others = q.npcs.filter((n) => n.inLine).flatMap((n) => [0.5, 0.9, 1.3, 1.7].map((h) => window.mzansiScreenOf(n.x, n.z, h)))
    for (const h of [1.72, 1.6, 1.45, 1.25, 1.0]) {
      const s = window.mzansiScreenOf(v.x, v.z, h)
      if (!s || s.behind || s.y < 290) continue
      if (others.every((o) => !o || Math.hypot(o.x - s.x, o.y - s.y) > 24)) return { ...s, h }
    }
    return null
  }, [which, vendor])
}

async function playLine(page, { which, vendor, spawn, name }) {
  test.setTimeout(900000)
  fs.mkdirSync(OUT, { recursive: true })
  await student(page, { spawn, run: { money: 300 } })
  const f = await finger(page)
  await expect.poll(async () => (await read.queue(page, which))?.people || 0, { timeout: 30000 }).toBeGreaterThan(1)
  // Sample in the page every 100 ms (nothing the test awaits can skip a sample).
  await page.evaluate((w) => {
    window.__qs = []
    window.__qsTimer = setInterval(() => {
      const s = window.mzansiQueueWalks(w)
      if (s) window.__qs.push({ t: s.now, changed: s.changed, maxPer: s.maxPer, endings: s.endings, npcs: s.npcs, player: window.mzansiPlayerPos() })
    }, 100)
  }, which)
  const inLine = async () => (await read.queue(page, which)).order.includes('player')
  // Join and leave five times, quickly. A round: tap her, wait to be in the line, walk
  // off, wait to be out of it. A tap that misses (it lands on someone in front of her and
  // opens their chat) costs one more round, as it would a player: five rounds done, in at
  // most eight tries.
  const cycles = []
  const joinTries = [] // (taps that didn't join, for the report)
  const tappable = (p) => Boolean(p) && !p.behind && p.x > 12 && p.x < 400 && p.y > 285 && p.y < 790
  const t0 = Date.now()
  for (let k = 0; k < 8 && cycles.filter((c) => c.joined && c.left).length < 5; k++) {
    await closeCards(page, f)
    let v = await vendorPoint(page, which, vendor)
    // (from across the Quad Mam' Gugu is at the screen's edge, under the HUD: closer first)
    if (!tappable(v)) {
      await approach(page, f, () => page.evaluate((id) => window.mzansiPersonPos(id), vendor))
      v = (await vendorPoint(page, which, vendor)) || (await read.person(page, vendor))
    }
    await f.tap(v.x, v.y)
    let joined = false
    // (the first walk over can be long: after that the player stays near the line)
    for (let i = 0; i < (k ? 60 : 135) && !joined; i++) { await page.waitForTimeout(150); joined = await inLine() }
    if (!joined) {
      joinTries.push({ round: k, v: [Math.round(v.x), Math.round(v.y), v.h ?? null], state: await read.state(page), talk: await page.locator('.g-talk h2').first().textContent({ timeout: 500 }).catch(() => null), activity: await page.locator('#world').getAttribute('data-activity'), me: await read.pos(page) })
      cycles.push({ joined, left: false })
      console.log('ROUND', k, Math.round((Date.now() - t0) / 1000) + 's', 'missed', JSON.stringify(joinTries.at(-1)))
      continue
    }
    // Walk off (her order card can be open at the front: Goodbye first)
    let left = false
    for (let tries = 0; tries < 2 && !left; tries++) {
      await closeCards(page, f)
      const away = await awayFromLine(page, which)
      if (away) await f.tap(away.s.x, away.s.y)
      // (at the front the line keeps your place while you walk off, and lets go once you
      // have stood free for 3 s: scene.js lineTick)
      for (let i = 0; i < 40 && !left; i++) { await page.waitForTimeout(150); left = !(await inLine()) }
    }
    cycles.push({ joined, left })
    console.log('ROUND', k, Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify({ joined, left, v: [Math.round(v.x), Math.round(v.y)], me: await read.pos(page) }))
  }
  // Stand right on slot 2 (just beside the person standing there, so the tap lands on the
  // ground, not on them), then stay put for 10 s.
  const q = await page.evaluate((w) => window.mzansiQueueWalks(w), which)
  const s2 = q.slots[2]
  const s3 = q.slots[3]
  const ux = s3.x - s2.x
  const uz = s3.z - s2.z
  const ul = Math.hypot(ux, uz) || 1
  const spot = { x: s2.x - (uz / ul) * 0.3, z: s2.z + (ux / ul) * 0.3 }
  // (off screen from where the player walked off to: step towards it first)
  await closeCards(page, f)
  await approach(page, f, async () => spot)
  const sp = await read.screenOf(page, spot.x, spot.z, 0)
  if (!tappable(sp)) console.log('SLOT2 off screen', JSON.stringify({ me: await read.pos(page), spot, sp, slots: q.slots, talk: await page.locator('.g-talk').isVisible(), sheet: await page.locator('.g-sheet').isVisible(), state: await read.state(page) }))
  expect(tappable(sp), 'slot 2 is on screen to tap').toBe(true)
  await f.tap(sp.x, sp.y)
  await page.waitForTimeout(2500)
  if (await page.locator('.g-talk').isVisible()) {
    const bye = page.locator('.g-talk [data-act="talk-bye"], .g-talk [data-act="talk-close"]').first()
    if (await bye.count()) { const b = await bye.boundingBox(); await f.tap(b.x + b.width / 2, b.y + b.height / 2) }
  }
  console.log('SLOT2 at', Math.round((Date.now() - t0) / 1000) + 's')
  const standFrom = await page.evaluate(() => performance.now())
  await page.screenshot({ path: `${OUT}/${name}-slot2.png` })
  // 10 s on slot 2: pushed off it by whoever stands there, the player steps back on (a
  // tap), so the line moving up runs into them.
  const onSlot = []
  for (let t = 0; t < 10000; t += 500) {
    await page.waitForTimeout(500)
    const p = await read.pos(page)
    const off = Math.hypot(p.x - spot.x, p.z - spot.z)
    onSlot.push(+Math.hypot(p.x - s2.x, p.z - s2.z).toFixed(2))
    if (off > 0.45 && t % 2000 === 0) {
      await closeCards(page, f)
      const at = await read.screenOf(page, spot.x, spot.z, 0)
      await f.tap(at.x, at.y)
    }
  }
  const me = await read.pos(page)
  // (sampling goes on until 3.5 s after the line last changed, at most 15 s more)
  for (let i = 0; i < 30; i++) {
    const quiet = await page.evaluate((w) => { const s = window.mzansiQueueWalks(w); return s.now - s.changed }, which)
    if (quiet > 3500) break
    await page.waitForTimeout(500)
  }
  const samples = await page.evaluate(() => { clearInterval(window.__qsTimer); return window.__qs })
  await page.screenshot({ path: `${OUT}/${name}-after.png` })

  // 1. Facing flips: > 90 degrees between two samples, counted per one-second window.
  const flips = {} // id -> [times]
  for (let i = 1; i < samples.length; i++) {
    for (const n of samples[i].npcs) {
      const before = samples[i - 1].npcs.find((o) => o.id === n.id)
      if (before && Math.abs(wrap(n.rot - before.rot)) > Math.PI / 2) (flips[n.id] ||= []).push(samples[i].t)
    }
  }
  let worstFlips = 0
  let worstWho = ''
  for (const [id, times] of Object.entries(flips)) {
    for (const t of times) {
      const inSecond = times.filter((u) => u >= t && u < t + 1000).length
      if (inSecond > worstFlips) { worstFlips = inSecond; worstWho = id }
    }
  }
  // 2. Never two walks at once.
  const mostWalks = Math.max(0, ...samples.map((s) => Math.max(s.maxPer, ...s.npcs.map((n) => n.walks))))
  // 3. Settled within 3 s of the line stopping. After each change with no other change in
  // the next 3 s (and 3 s of samples to judge by): each NPC in the line comes to rest
  // (no walk) within 3 s, counted from the change, or from when it came within 1.5 m of
  // its place if it was still walking in from further away (back from eating, round the
  // outside of the line: a long walk, not a stuck one). strictMs: from the change alone.
  const changes = [...new Set(samples.map((s) => s.changed).filter(Boolean))].sort((a, b) => a - b)
  const settles = []
  const strict = []
  const slow = []
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    const next = changes[i + 1] ?? Infinity
    if (next - c < 3000) continue
    if (samples.at(-1).t - c < 3000) continue // (no 3 s of samples after it to judge by)
    const after = samples.filter((s) => s.t >= c && s.t < next)
    const all = samples.find((s) => s.t >= c && s.npcs.filter((n) => n.inLine).every((n) => n.walks === 0))
    strict.push(all ? Math.round(all.t - c) : null)
    let worst = 0
    let who = ''
    for (const id of new Set(after.flatMap((s) => s.npcs.filter((n) => n.inLine).map((n) => n.id)))) {
      const near = after.find((s) => { const n = s.npcs.find((o) => o.id === id); return n?.inLine && n.place >= 0 && Math.hypot(n.x - (q.slots[n.place]?.x ?? n.x), n.z - (q.slots[n.place]?.z ?? n.z)) < 1.5 })
      // (judged only with 3 s of samples left after it came near, before the next change)
      if (!near || (after.at(-1).t - Math.max(c, near.t) < 3000 && next !== Infinity)) continue
      const rest = after.find((s) => s.t >= near.t && (s.npcs.find((o) => o.id === id)?.walks ?? 0) === 0)
      const ms = rest ? rest.t - Math.max(c, near.t) : Infinity
      if (ms > worst) { worst = ms; who = id }
    }
    settles.push(Math.round(worst))
    // (a slow one: who, from where to where, and where the player stood)
    if (worst > 3000) {
      const path = after.filter((_, k) => k % 5 === 0).map((s) => { const n = s.npcs.find((o) => o.id === who); return n ? [n.x, n.z, n.walks] : null })
      slow.push({ at: Math.round(c - samples[0].t), ms: Math.round(worst), who, path, player: after.filter((_, k) => k % 5 === 0).map((s) => s.player && [s.player.x, s.player.z]) })
    }
  }
  const worstSettle = Math.max(0, ...settles)
  const endings = samples.at(-1).endings
  const fromSlot2 = Math.hypot(me.x - s2.x, me.z - s2.z)
  const report = { which, cycles, joinTries, onSlot2: onSlot, samples: samples.length, seconds: Math.round((samples.at(-1).t - samples[0].t) / 100) / 10, standingFor: Math.round((samples.at(-1).t - standFrom) / 1000), playerFromSlot2: +fromSlot2.toFixed(2), worstFlipsPerSecond: worstFlips, worstWho, flips: Object.fromEntries(Object.entries(flips).map(([k, v]) => [k, v.length])), mostWalksAtOnce: mostWalks, settlesMs: settles, worstSettleMs: worstSettle, strictMs: strict, walkEndings: endings, slow }
  console.log('JITTER', JSON.stringify(report))
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(report, null, 2))
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)

  expect(cycles.filter((c) => c.joined && c.left).length, 'joined and left five times (in at most eight tries)').toBe(5)
  expect(worstFlips, `facing flips in one second (${worstWho})`).toBeLessThanOrEqual(2)
  expect(mostWalks, 'walks one NPC has at once').toBeLessThanOrEqual(1)
  expect(settles.length, 'the line stopped at least once').toBeGreaterThan(0)
  expect(worstSettle, 'settled within 3 s of the line stopping').toBeLessThanOrEqual(3000)
}

test('caf queue: join and leave five times, stand on slot 2: no jitter', async ({ page }) => {
  await playLine(page, { which: 'caf', vendor: 'auntie_pinky', spawn: 'cafeteria', name: 'caf' })
})

test("Mam' Gugu's stall: join and leave five times, stand on slot 2: no jitter", async ({ page }) => {
  await playLine(page, { which: 'stall', vendor: 'mam_gugu', spawn: 'quad', name: 'stall' })
})
