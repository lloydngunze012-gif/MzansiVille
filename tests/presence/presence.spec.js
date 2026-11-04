// Presence (retention spec, item 1): two real players on the same campus, side by side
// at phone size, recorded as one video. Each phone is a frame on its own origin
// (127.0.0.1 and localhost), so each has its own save and its own presence id; both
// talk to the real Supabase Realtime, on a test room (?room=) so nobody on the live
// campus sees them. Play is by finger only (touch events on the glass); window.mzansi*
// hooks are only READ, to know where to put the finger and to measure.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { fpsGate } from '../fps.js'

const OUT = 'docs/sprints/presence'
const ROOM = `test-${Date.now().toString(36)}`
const W = 412
const H = 915
const GAP = 12
const A_ORIGIN = 'http://127.0.0.1:5173'
const B_ORIGIN = 'http://localhost:5173'

test.use({ viewport: { width: W * 2 + GAP, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, video: { mode: 'on', size: { width: W * 2 + GAP, height: H } } })
test.setTimeout(600000)
test.use({ actionTimeout: 30000, navigationTimeout: 60000 })
// Two 3D scenes at once: on the real GPU (the software one draws them in slow motion).
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] } })

const results = []
function note(id, pass, detail) {
  results.push({ id, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`)
}

// Make a student in the creator by taps, then move the save on to after the lecture
// (setup, not play) and open the campus. No ?spawn: the game picks where you start.
async function enrol(frame, origin, name, gender) {
  console.log('enrol', name)
  const q = `morning=0&room=${ROOM}`
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.evaluate(() => localStorage.clear())
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.locator('#name').fill(name)
  await frame.locator('#residence').selectOption({ index: 1 })
  await frame.locator('#course').selectOption({ index: 1 })
  await frame.locator(`[data-gender="${gender}"]`).first().tap().catch(() => {})
  await frame.locator('[data-act="begin"]').tap()
  await frame.locator('[data-step="story"] [data-act="begin"]').tap()
  console.log('  creator done', name)
  await frame.waitForURL(/#\/play/, { timeout: 30000 })
  await frame.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}

let opens = 0
async function open(frame, origin, headOut = true) {
  console.log('open', origin)
  // (a new query each time: the same URL again would only change the hash, no reload)
  await frame.goto(`${origin}/?morning=0&room=${ROOM}&visit=${++opens}#/play`)
  await expect(frame.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  // A card on arrival (a story beat): read it and tap Continue, like a player.
  for (let i = 0; i < 3; i++) {
    const card = frame.locator('[role="dialog"] button:visible').first()
    if (!(await card.isVisible().catch(() => false))) break
    console.log('  card:', (await frame.locator('[role="dialog"]:visible').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80))
    await card.tap()
    await frame.waitForTimeout(800)
  }
  // Players start in their house's common room (build plan, Piece 0): head out.
  if (headOut) {
    const out = frame.locator('.house-out')
    if (await out.isVisible().catch(() => false)) { await out.tap(); await frame.waitForTimeout(800) }
  }
}

// A finger on one phone's glass: page coordinates are the frame's plus its offset.
async function finger(page, frame, dx) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x: x + dx, y, id: 1, radiusX: 8, radiusY: 8, force: 1 })) })
  return { async tap(x, y) { await send('touchStart', [[x, y]]); await page.waitForTimeout(60); await send('touchEnd', []) } }
}

// Where on that phone's screen a ground point is, metres from its player, in an open
// direction it can see (read only).
async function groundAhead(frame, metres, turn = 0) {
  return frame.evaluate(([m, t]) => {
    const p = window.mzansiPlayerPos()
    for (const a of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2, 2.7, -2.7, 3.1]) {
      const x = p.x + Math.sin(Math.PI + a + t) * m
      const z = p.z + Math.cos(Math.PI + a + t) * m
      const s = window.mzansiScreenOf(x, z, 0)
      // (clear of the HUD, the minimap bottom left and the buttons)
      if (s && !s.behind && s.x > 40 && s.x < 372 && s.y > 230 && s.y < 640) return { x, z, s }
    }
    return null
  }, [metres, turn])
}

const others = (frame) => frame.evaluate(() => window.mzansiOthers())
const me = (frame) => frame.evaluate(() => window.mzansiPlayerPos())
const presence = (frame) => frame.evaluate(() => window.mzansiPresence())
const label = (frame) => frame.locator('[data-online]').first().textContent()

test('two players on one campus', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  // The two phones on one page (a page on its own made-up origin: an about:blank page
  // denies its frames their storage).
  await page.route('http://phones.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0c0c10;display:flex;gap:${GAP}px;overflow:hidden">
    <iframe name="a" style="border:0;width:${W}px;height:${H}px" allow="autoplay"></iframe>
    <iframe name="b" style="border:0;width:${W}px;height:${H}px" allow="autoplay"></iframe></body>` }))
  await page.goto('http://phones.test/')
  const A = page.frame({ name: 'a' })
  const B = page.frame({ name: 'b' })
  for (const f of [A, B]) f.page().on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)) })

  // Player A starts in their house's common room, then heads out onto campus.
  await enrol(A, A_ORIGIN, 'Thandeka', 'female')
  await open(A, A_ORIGIN)
  await expect.poll(async () => (await presence(A)).live, { timeout: 20000 }).toBe(true)
  await page.waitForTimeout(2500)
  const spawnA = await A.locator('#world').getAttribute('data-spawn')
  const outA = await A.evaluate(() => window.mzansiInHouse())
  note('S1 start in your house, head out', spawnA === 'house' && !outA, `A spawned "${spawnA}", out of the house: ${!outA}, count "${await label(A)}"`)

  // Player B joins: spawns beside A, and each sees the other with name and number.
  await enrol(B, B_ORIGIN, 'Kabelo', 'male')
  await open(B, B_ORIGIN)
  const t0 = Date.now()
  await expect.poll(async () => (await others(A)).length === 1 && (await others(B)).length === 1, { timeout: 20000, intervals: [200] }).toBe(true)
  const seenIn = Date.now() - t0
  await page.waitForTimeout(3000)
  const [pa, pb] = [await presence(A), await presence(B)]
  const [oa, ob] = [(await others(A))[0], (await others(B))[0]]
  note('P1 each sees the other', oa?.tag.includes('Kabelo') && ob?.tag.includes('Thandeka') && oa.tag.includes(pb.me.num) && ob.tag.includes(pa.me.num),
    `seen within ${seenIn} ms; A sees "${oa?.tag}", B sees "${ob?.tag}"`)
  const [la, lb] = [await label(A), await label(B)]
  note('P2 students-on-campus count', la === '2 on campus' && lb === '2 on campus', `A shows "${la}", B shows "${lb}"`)
  // Below 20 fps on either phone the movement checks can't pass or fail: INCONCLUSIVE.
  await fpsGate(A, B)
  await page.screenshot({ path: `${OUT}/P1-both.png` })

  // B walks: four taps on the ground; A's copy of B follows smoothly and ends where B is.
  const fb = await finger(page, B, W + GAP)
  const trace = []
  for (const turn of [0, 1.6, -1.6, 3.1]) {
    const g = await groundAhead(B, 7, turn)
    if (!g) continue
    await fb.tap(g.s.x, g.s.y)
    let still = 0
    for (let i = 0; i < 40 && still < 4; i++) {
      await page.waitForTimeout(200)
      const [truth, seen] = [await me(B), (await others(A))[0]]
      if (seen) trace.push({ t: Date.now(), bx: truth.x, bz: truth.z, ax: seen.x, az: seen.z, pose: seen.walking ? 'walk clip' : seen.pose })
      const n = trace.length
      still = n > 1 && Math.hypot(trace[n - 1].bx - trace[n - 2].bx, trace[n - 1].bz - trace[n - 2].bz) < 0.01 ? still + 1 : 0
    }
  }
  await page.waitForTimeout(1500)
  const endB = await me(B)
  const endSeen = (await others(A))[0]
  let worstStep = 0
  for (let i = 1; i < trace.length; i++) worstStep = Math.max(worstStep, Math.hypot(trace[i].ax - trace[i - 1].ax, trace[i].az - trace[i - 1].az))
  const walked = trace.reduce((s, p, i) => (i ? s + Math.hypot(p.bx - trace[i - 1].bx, p.bz - trace[i - 1].bz) : 0), 0)
  const walkPoses = [...new Set(trace.map((p) => p.pose))].join(',')
  const endGap = Math.hypot(endB.x - endSeen.x, endB.z - endSeen.z)
  note('P3 movement follows, interpolated', endGap < 0.15 && worstStep < 1.2 && walked > 8,
    `B walked ${walked.toFixed(1)} m; A's view ends ${(endGap * 100).toFixed(0)} cm from B; biggest jump between 0.2 s samples ${worstStep.toFixed(2)} m (jog 4 m/s = 0.8); body seen ${walkPoses}`)
  await page.screenshot({ path: `${OUT}/P3-walked.png` })

  // No collision between players: A walks to the ground 40 cm beside B (closer than the
  // collision pass lets anyone stand to a person, 50 cm) and ends there. (A tap ON B
  // opens B's card now, Piece 1a, so the finger goes beside them. B far off: a few
  // metres nearer first.)
  const fa = await finger(page, A, 0)
  const open_ = (s) => s && !s.behind && s.x > 40 && s.x < 372 && s.y > 230 && s.y < 640
  let closest = 99
  for (let i = 0; i < 12 && closest > 0.45; i++) {
    const seen = (await others(A))[0]
    const at = await me(A)
    const d = Math.hypot(seen.x - at.x, seen.z - at.z)
    const ux = (seen.x - at.x) / d
    const uz = (seen.z - at.z) / d
    const target = d > 3.5 ? { x: at.x + ux * Math.min(5, d - 2.5), z: at.z + uz * Math.min(5, d - 2.5) } : { x: seen.x - uz * 0.4, z: seen.z + ux * 0.4 }
    const s = await A.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 0), [target.x, target.z])
    if (!open_(s)) continue
    await fa.tap(s.x, s.y)
    if (await A.locator('.pc-sheet-wrap.on').isVisible().catch(() => false)) { await page.waitForTimeout(600); await fa.tap(200, 90) }
    await page.waitForTimeout(800)
    await expect.poll(async () => { const p1 = await me(A); await page.waitForTimeout(300); const p2 = await me(A); return Math.hypot(p1.x - p2.x, p1.z - p2.z) }, { timeout: 20000 }).toBeLessThan(0.01)
    const a2 = await me(A)
    closest = Math.min(closest, Math.hypot(a2.x - seen.x, a2.z - seen.z))
  }
  const overlap = closest
  note('P4 players pass through each other', overlap < 0.45, `A walked up beside B and stopped ${(overlap * 100).toFixed(0)} cm from B's middle (people keep 50 cm+ apart; players don't)`)
  await page.screenshot({ path: `${OUT}/P4-through.png` })

  // B closes the tab: gone from A within 10 s.
  const closeAt = Date.now()
  await B.goto('about:blank')
  await expect.poll(async () => (await others(A)).length, { timeout: 12000, intervals: [100] }).toBe(0)
  const goneIn = Date.now() - closeAt
  await expect.poll(() => label(A), { timeout: 5000 }).toBe('1 on campus')
  note('L1 closing the tab: gone within 10 s', goneIn < 10000, `B vanished from A after ${(goneIn / 1000).toFixed(1)} s; count "${await label(A)}"`)
  await page.screenshot({ path: `${OUT}/L1-closed.png` })

  // B comes back, then their phone freezes (no goodbye, the socket left open): gone
  // within 10 s too.
  await open(B, B_ORIGIN)
  await expect.poll(async () => (await others(A)).length, { timeout: 20000 }).toBe(1)
  await page.waitForTimeout(2500)
  const cdpB = await page.context().newCDPSession(B)
  await cdpB.send('Debugger.enable')
  const freezeAt = Date.now()
  cdpB.send('Debugger.pause').catch(() => {})
  await expect.poll(async () => (await others(A)).length, { timeout: 14000, intervals: [100] }).toBe(0)
  const frozenGone = Date.now() - freezeAt
  note('L2 a frozen phone (no goodbye): gone within 10 s', frozenGone < 10000, `B vanished from A ${(frozenGone / 1000).toFixed(1)} s after B's page froze`)
  await cdpB.send('Debugger.resume').catch(() => {})
  await page.waitForTimeout(1000)

  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ room: ROOM, results }, null, 2))
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/presence-two-phones.webm`)
  expect(results.filter((r) => !r.pass).map((r) => r.id)).toEqual([])
})
