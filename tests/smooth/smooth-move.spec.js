// S2 (movement, needs the real GPU; owner, 7 Nov; docs/design/smoothness-reports.md section 6):
// a ground tap records its tap-to-move time; a tap behind something solid ends in one stall
// ('player' or 'against') at the spot where the player stopped; each counts once.
// The fps gate runs first (tests/fps.js): under 20 fps this is INCONCLUSIVE, not a pass.
// npx playwright test tests/smooth/smooth-move.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { PHONE, student, finger, read, tapOn, dist, groundAhead } from '../basics/touch.js'
import fs from 'node:fs'

const OUT = 'docs/sprints/smoothness'
fs.mkdirSync(OUT, { recursive: true })
test.use({ ...PHONE, video: 'off' })
test.describe.configure({ timeout: 300000 })

test('S2a a ground tap records its tap-to-move time and the walk', async ({ page }) => {
  await student(page, { spawn: 'gate', query: '&smooth=test' })
  const f = await finger(page)
  // (all the campus buckets together: which place a walk is filed under changes as you move)
  const seconds = () => page.evaluate(() => [...window.mzansiSmooth.buckets.values()].reduce((a, b) => a + b.seconds, 0))
  // (past the 3 s loading hitch, so this play counts)
  await expect.poll(seconds, { timeout: 60000, intervals: [500] }).toBeGreaterThan(1)
  const bucket = () => page.evaluate(() => {
    const all = [...window.mzansiSmooth.buckets.values()]
    return { taps: all.reduce((a, b) => a + b.taps, 0), tapMs: all.flatMap((b) => b.tapMs), walks: all.reduce((a, b) => a + b.walks, 0), stalls: all.reduce((a, b) => a + b.stalls, 0), stallAt: all.flatMap((b) => b.stallAt.map((s) => ({ ...s }))) }
  })

  // 1. Tap the ground 8 m away (the Top view: it fits on a phone) and walk there.
  await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
  await page.waitForTimeout(1200)
  const before = await bucket()
  const far = await groundAhead(page, 8)
  expect(far, 'open ground 8 m away on screen').toBeTruthy()
  await f.tap(far.s.x, far.s.y)
  await page.waitForTimeout(600)
  await expect.poll(() => read.state(page), { timeout: 8000 }).toMatch(/walking|running/)
  await expect.poll(() => read.state(page), { timeout: 20000, intervals: [300] }).toBe('free')
  const afterTap = await bucket()
  console.log('S2 tap:', JSON.stringify({ taps: afterTap.taps - before.taps, tapMs: afterTap.tapMs, walks: afterTap.walks - before.walks }))
  expect(afterTap.taps - before.taps, 'one ground tap counted').toBe(1)
  expect(afterTap.tapMs.length - before.tapMs.length, 'and its tap-to-move time').toBe(1)
  const ms = afterTap.tapMs[afterTap.tapMs.length - 1]
  expect(ms, 'tap to first step, in ms: within a frame or two, never seconds').toBeGreaterThanOrEqual(0)
  expect(ms).toBeLessThan(500)
  expect(afterTap.walks - before.walks, 'the walk was counted').toBeGreaterThanOrEqual(1)
  expect(afterTap.stalls, 'no stall on a clear walk').toBe(before.stalls)
  const rows = await page.evaluate(() => window.mzansiSmoothFlush())
  console.log('S2a rows:', JSON.stringify(rows.map((r) => ({ place: r.place, seconds: r.seconds, fps_typical: r.fps_typical, fps_low: r.fps_low, taps: r.taps, tap_ms: r.tap_ms, walks: r.walks, stalls: r.stalls }))))
  expect(rows.reduce((a, r) => a + r.taps, 0), 'the ground tap is in the report').toBeGreaterThanOrEqual(1)
  expect(rows.some((r) => r.tap_ms !== null), 'with its tap-to-move time').toBe(true)
  expect(rows.every((r) => r.stall_at.length <= 8)).toBe(true)
})

test('S2b a tap behind something solid ends in at most one stall, recorded where the player stopped', async ({ page }) => {
  await student(page, { spawn: 'quad', query: '&smooth=test' })
  const f = await finger(page)
  const seconds = () => page.evaluate(() => [...window.mzansiSmooth.buckets.values()].reduce((a, b) => a + b.seconds, 0))
  await expect.poll(seconds, { timeout: 60000, intervals: [500] }).toBeGreaterThan(1)
  const bucket = () => page.evaluate(() => {
    const all = [...window.mzansiSmooth.buckets.values()]
    return { stalls: all.reduce((a, b) => a + b.stalls, 0), stallAt: all.flatMap((b) => b.stallAt.map((s) => ({ ...s }))) }
  })
  await tapOn(page, f, page.locator('[data-act="view"][data-mode="top"]'))
  await page.waitForTimeout(1200)

  // Tap just behind the biggest solid thing near you (a stage, a stall, a counter).
  const spot = await page.evaluate(() => {
    const p = window.mzansiPlayerPos()
    const near = window.mzansiColliders().filter((c) => Math.hypot(c.cx - p.x, c.cz - p.z) < 14 && c.hx * c.hz > 0.6).sort((a, b) => b.hx * b.hz - a.hx * a.hz)
    for (const c of near) {
      const dx = c.cx - p.x
      const dz = c.cz - p.z
      const d = Math.hypot(dx, dz) || 1
      const r = Math.max(c.hx, c.hz) + 0.5
      const x = c.cx + (dx / d) * r
      const z = c.cz + (dz / d) * r
      const s = window.mzansiScreenOf(x, z, 0)
      if (s && !s.behind && s.x > 30 && s.x < 382 && s.y > 170 && s.y < 780) return { x, z, s, kind: c.kind, cx: c.cx, cz: c.cz, hx: c.hx, hz: c.hz }
    }
    return null
  })
  expect(spot, 'something solid on screen to tap behind').toBeTruthy()
  const pre = await bucket()
  await f.tap(spot.s.x, spot.s.y)
  await page.waitForTimeout(500)
  await expect.poll(() => read.state(page), { timeout: 20000, intervals: [300] }).toBe('free')
  await page.waitForTimeout(500)
  const end = await read.pos(page)
  const post = await bucket()
  const newStalls = post.stallAt.slice(pre.stallAt.length)
  console.log('S2b wall:', JSON.stringify({ behind: spot.kind, end, count: post.stalls - pre.stalls, newStalls }))
  await page.screenshot({ path: `${OUT}/S2b-wall.png` })
  // The route round it may simply succeed (then nothing stalled and nothing is recorded);
  // when it doesn't, it's recorded once, kind 'player' or 'against', where the player stopped.
  const stalled = post.stalls - pre.stalls
  test.info().annotations.push({ type: 'wall', description: `${spot.kind}: ${stalled} stall(s)` })
  expect(stalled, 'a held-up walk is recorded once, never twice (against + player)').toBeLessThanOrEqual(1)
  if (dist(end, spot) > 1.5) {
    expect(stalled, 'the walk ended short of the spot behind the wall: one stall').toBe(1)
    const s = newStalls[0]
    expect(['player', 'against']).toContain(s.k)
    expect(Math.hypot(s.x - end.x, s.z - end.z), 'recorded where the player stopped').toBeLessThan(0.6)
    expect(Math.hypot(s.x - spot.cx, s.z - spot.cz), 'beside the solid thing').toBeLessThan(Math.max(spot.hx, spot.hz) + 14)
  }

  // The place the reports use is the one near the player, and costs next to nothing to find.
  const place = await page.evaluate(() => { const t0 = performance.now(); let p; for (let i = 0; i < 1000; i++) p = window.mzansiSmoothPlace(); return { p, ms: (performance.now() - t0) / 1000, at: window.mzansiPlayerPos() } })
  console.log('S2b place:', JSON.stringify(place))
  expect(typeof place.p).toBe('string')
  expect(place.ms, 'finding the place (twice a second): well under a tenth of a millisecond').toBeLessThan(0.1)
})

// S2c: the day 1 home scene counts ground taps and tap-to-move too (home.js onTap and its frames).
// A new student, the home opening; once it lets you walk, tap the floor until a tap is counted.
test('S2c a ground tap at home records tap_ms in the home bucket', async ({ page }) => {
  await page.goto('/?talk=auto&smooth=test#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?talk=auto&smooth=test&home=1#/new')
  await page.locator('[data-part="gender"][data-id="female"]').tap()
  const { enrolUI } = await import('../enrol.js')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1, from: 'KwaZulu-Natal' })
  await expect(page).toHaveURL(/#\/morning/)
  const host = page.locator('#home3d')
  await expect(host).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  const fps = await page.evaluate(() => new Promise((resolve) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else resolve(Math.round(n / 1.5)) }; requestAnimationFrame(f) }))
  console.log('S2c fps (page)', fps)
  test.skip(fps < 20, `INCONCLUSIVE: ${fps} fps, below 20`)
  const homeBucket = () => page.evaluate(() => { const b = [...window.mzansiSmooth.buckets.values()].filter((x) => x.scene === 'home'); return { taps: b.reduce((a, x) => a + x.taps, 0), tapMs: b.flatMap((x) => x.tapMs), places: b.map((x) => x.place), seconds: b.reduce((a, x) => a + x.seconds, 0) } })
  // Wait out the loading hitch, then tap the floor in front of you now and then.
  let got = null
  for (let i = 0; i < 40 && !got; i++) {
    await page.waitForTimeout(1500)
    const b = await homeBucket()
    if (b.seconds < 1) continue
    await page.touchscreen.tap(206, 600)
    await page.waitForTimeout(400)
    const after = await homeBucket()
    if (after.taps > 0 && after.tapMs.length > 0) got = after
  }
  console.log('S2c home:', JSON.stringify(got))
  expect(got, 'a home ground tap was counted with its tap-to-move time').toBeTruthy()
  expect(got.places.every((p) => /^home:(suburban|township)$/.test(p)), 'filed under home:<style>').toBe(true)
  expect(got.tapMs[0]).toBeGreaterThanOrEqual(0)
  expect(got.tapMs[0]).toBeLessThan(1000)
})

// S6 (opt-in: it writes to the real Supabase table, so it only runs with SMOOTH_S6=1, after Lloyd has
// run the smooth_reports SQL block): play 15 s in the Quad with ?smooth=live, hide the page, and
// confirm one row lands. With SUPABASE_SERVICE_ROLE_KEY in the local .env (never committed) the row
// is read back and every qa-live row deleted; without it, check #/smooth (or run
//   delete from public.smooth_reports where build = 'qa-live';
// in the SQL editor afterwards).
test('S6 a real send: 15 s in the Quad with ?smooth=live, hide the page, one row lands (opt-in)', async ({ page }) => {
  test.skip(!process.env.SMOOTH_S6, 'opt-in: SMOOTH_S6=1 npx playwright test tests/smooth/smooth-move.spec.js -g S6 --config playwright.gpu.config.js --workers=1')
  const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  const url = env.VITE_SUPABASE_URL
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  await student(page, { spawn: 'quad', query: '&smooth=live' })
  const started = new Date().toISOString()
  await page.waitForTimeout(15000)
  // Hide the page: the report goes out on visibilitychange.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => page.evaluate(() => (window.__smoothPosts || []).map((p) => p.status)), { timeout: 15000 }).not.toEqual([])
  const posts = await page.evaluate(() => window.__smoothPosts)
  console.log('S6 posts:', JSON.stringify(posts))
  expect(posts[0].status, 'the table answered 201 (run the smooth_reports SQL block first if this is 404)').toBe(201)
  if (service) {
    const headers = { apikey: service, Authorization: `Bearer ${service}` }
    const rows = await (await fetch(`${url}/rest/v1/smooth_reports?build=eq.qa-live&created_at=gte.${encodeURIComponent(started)}&select=*`, { headers })).json()
    console.log('S6 rows:', JSON.stringify(rows.map((r) => ({ place: r.place, seconds: r.seconds, fps_typical: r.fps_typical, boot_ms: r.boot_ms, load_ms: r.load_ms, device: r.device }))))
    expect(rows.length, 'one row for the Quad').toBeGreaterThanOrEqual(1)
    expect(rows.every((r) => r.build === 'qa-live' && r.seconds >= 10)).toBe(true)
    await fetch(`${url}/rest/v1/smooth_reports?build=eq.qa-live`, { method: 'DELETE', headers })
    const left = await (await fetch(`${url}/rest/v1/smooth_reports?build=eq.qa-live&select=id`, { headers })).json()
    expect(left, 'the qa-live rows are deleted').toEqual([])
  } else {
    console.log('S6: no SUPABASE_SERVICE_ROLE_KEY in .env: check #/smooth for a qa-live row, then delete from public.smooth_reports where build = \'qa-live\'')
  }
})
