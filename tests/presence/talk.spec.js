// Piece 3, talking to each other. Two phones side by side in one page (a real player
// each, on their own test channel). Touch only; hooks only READ.
// T2 (part 1): B, in Eye view, taps A standing within 4 m: A's card slides up and B's
// camera eases into the two-shot (both heads on screen, about 2.5 m back, 1.7 m up);
// closing the card eases it back to B's Eye view.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { measureFps } from '../fps.js'

const OUT = 'docs/sprints/talk'
const W = 412
const H = 915
const GAP = 12
const A_ORIGIN = 'http://127.0.0.1:5173'
const B_ORIGIN = 'http://localhost:5173'

test.use({ viewport: { width: W * 2 + GAP, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, video: { mode: 'on', size: { width: W * 2 + GAP, height: H } } })
test.use({ actionTimeout: 30000, navigationTimeout: 60000 })
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(600000)

let ROOM = ''
async function enrol(frame, origin, name, gender) {
  const q = `morning=0&room=${ROOM}`
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.evaluate(() => localStorage.clear())
  await frame.goto(`${origin}/?${q}#/new`)
  await frame.locator('#name').fill(name)
  await frame.locator('#residence').selectOption({ index: gender === 'male' ? 3 : 5 })
  await frame.locator('#course').selectOption({ index: 1 })
  await frame.locator(`[data-gender="${gender}"]`).first().tap().catch(() => {})
  await frame.locator('[data-act="begin"]').tap()
  await frame.locator('[data-step="story"] [data-act="begin"]').tap()
  await frame.waitForURL(/#\/play/, { timeout: 30000 })
  await frame.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}
let visits = 0
async function campus(frame, origin) {
  await frame.goto(`${origin}/?morning=0&room=${ROOM}&spawn=quad&visit=${++visits}#/play`)
  await expect(frame.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
}
async function finger(page, dx) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x: x + dx, y, id: 1, radiusX: 8, radiusY: 8, force: 1 })) })
  return { async tap(x, y) { await send('touchStart', [[x, y]]); await page.waitForTimeout(60); await send('touchEnd', []) } }
}
// A button in one phone, tapped like a finger (its box is in page coordinates).
async function tapIn(page, loc) {
  await loc.waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(350)
  const b = await loc.boundingBox()
  const f = await finger(page, 0)
  await f.tap(b.x + b.width / 2, b.y + b.height / 2)
}
// One phone taps the other player where they stand on its screen.
async function tapOther(page, frame, dx) {
  const o = (await frame.evaluate(() => window.mzansiOthers()))[0]
  const s = await frame.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 1.0), [o.x, o.z])
  await (await finger(page, dx)).tap(s.x, s.y)
}
// Every frame of one phone from now on: its camera and shot.
const record = (frame) => frame.evaluate(() => {
  window.__shot = []
  const tick = () => { if (!window.__shot) return; window.__shot.push({ t: performance.now(), ...window.mzansiShot() }); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stopRecord = (frame) => frame.evaluate(() => { const r = window.__shot; window.__shot = null; return r })
// How long an ease took (see tests/basics/twoshot.spec.js): ms, and frames late.
function easeTime(frames, into) {
  const start = frames.findIndex((f) => (into ? f.close && f.eased : !f.close))
  if (start < 0) return null
  const end = frames.findIndex((f, i) => i > start && !f.easing)
  if (end < 0) return null
  const t0 = frames[Math.max(0, start - 1)].t
  const due = frames.findIndex((f) => f.t >= t0 + 400)
  return { ms: Math.round(frames[end].t - t0), late: end - due }
}

// Two phones in one page, both enrolled and on campus; A stands a couple of metres
// from where B arrives (B spawns beside the busiest group of real players: A).
async function twoPhones(page, tag) {
  fs.mkdirSync(OUT, { recursive: true })
  ROOM = `test-${tag}-${Date.now().toString(36)}`
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.route('http://phones.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0c0c10;display:flex;gap:${GAP}px;overflow:hidden">
    <iframe name="a" style="border:0;width:${W}px;height:${H}px"></iframe><iframe name="b" style="border:0;width:${W}px;height:${H}px"></iframe></body>` }))
  await page.goto('http://phones.test/')
  const A = page.frame({ name: 'a' })
  const B = page.frame({ name: 'b' })
  await enrol(A, A_ORIGIN, 'Thandeka', 'female')
  await campus(A, A_ORIGIN)
  await enrol(B, B_ORIGIN, 'Kabelo', 'male')
  await campus(B, B_ORIGIN)
  await expect.poll(async () => (await B.evaluate(() => window.mzansiOthers())).length, { timeout: 30000 }).toBe(1)
  await expect.poll(async () => (await A.evaluate(() => window.mzansiOthers())).length, { timeout: 30000 }).toBe(1)
  // A steps a couple of metres off (so B's finger lands on A, not on B themself).
  const spot = await A.evaluate(() => {
    const p = window.mzansiPlayerPos()
    for (const [dx, dz] of [[-2, 1.2], [2, 1.2], [-2, -1.2], [2, -1.2], [0, 2.4], [-2.4, 0], [2.4, 0]]) {
      const s = window.mzansiScreenOf(p.x + dx, p.z + dz, 0)
      if (s && !s.behind && s.y > 240 && s.y < 640 && s.x > 40 && s.x < 372 && window.mzansiOpen(p.x + dx, p.z + dz)) return s
    }
    return null
  })
  await (await finger(page, 0)).tap(spot.x, spot.y)
  await page.waitForTimeout(3500)
  const fps = [await measureFps(A), await measureFps(B)]
  console.log(`FPS ${fps.join(', ')}`)
  test.info().annotations.push({ type: 'fps', description: fps.join(', ') })
  return { A, B, BX: W + GAP, fps }
}

async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

test('T2 tap a player within 4 m: two-shot (Eye view too), back out when the card closes', async ({ page }) => {
  const { B, BX } = await twoPhones(page, 't2')
  // B looks out of their own eyes (the view that used to frame a torso).
  await tapIn(page, B.locator('[data-act="view"][data-mode="eye"]'))
  await page.waitForTimeout(900)
  expect(await B.evaluate(() => window.mzansiShot().mode)).toBe('eye')
  // (turn to face A: a swipe would turn the view; read where A is and face them with the
  // view buttons' own camera... a tap on A needs A on screen, so turn by swiping)
  for (let i = 0; i < 8; i++) {
    const o = (await B.evaluate(() => window.mzansiOthers()))[0]
    const s = await B.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 1.0), [o.x, o.z])
    if (s && !s.behind && s.x > 40 && s.x < 372 && s.y > 200 && s.y < 760) break
    // swipe sideways: the Eye view turns with the finger
    const cdp = await page.context().newCDPSession(page)
    const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x: x + BX, y, id: 1, radiusX: 8, radiusY: 8, force: 1 })) })
    await send('touchStart', [[300, 500]])
    for (let k = 1; k <= 8; k++) { await send('touchMove', [[300 - k * 20, 500]]); await page.waitForTimeout(30) }
    await send('touchEnd', [])
    await page.waitForTimeout(400)
  }
  const before = await B.evaluate(() => window.mzansiShot())
  await page.screenshot({ path: `${OUT}/T2-before.png` })
  await record(B)
  for (let i = 0; i < 5 && !(await B.locator('.pc-sheet .pcard').isVisible().catch(() => false)); i++) {
    await tapOther(page, B, BX)
    await page.waitForTimeout(900)
  }
  await expect(B.locator('.pc-sheet .pcard')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(900)
  const into = await stopRecord(B)
  const shot = await B.evaluate(() => window.mzansiShot())
  const aId = (await B.evaluate(() => window.mzansiOthers()))[0].id
  const heads = await B.evaluate((id) => window.mzansiHeads([id]), aId)
  await page.screenshot({ path: `${OUT}/T2-card.png` })
  // Close: one tap on Close; the camera eases back to B's Eye view.
  await record(B)
  await tapIn(page, B.locator('.pc-sheet .pc-close'))
  await page.waitForTimeout(1200)
  const back = await stopRecord(B)
  const after = await B.evaluate(() => window.mzansiShot())
  await page.screenshot({ path: `${OUT}/T2-after.png` })
  const result = {
    before: { mode: before.mode, height: before.height },
    shot: { convo: shot.convo, eased: shot.eased, back: shot.back, height: shot.height, apart: shot.apart },
    heads: heads.heads.map((h) => ({ id: h.id === 'player' ? 'B' : 'A', inside: h.inside, underHud: h.underHud, hidden: h.hidden, shown: h.shown, dist: h.dist })),
    in: easeTime(into, true),
    out: easeTime(back, false),
    after: { mode: after.mode, close: after.close, convo: after.convo, height: after.height },
  }
  console.log('T2', JSON.stringify(result, null, 1))
  expect(result.shot.convo?.kind).toBe('player')
  expect(result.shot.eased, 'the two-shot').toBe(true)
  expect(result.shot.apart, 'within 4 m').toBeLessThanOrEqual(4)
  expect(result.shot.back).toBeGreaterThan(1.8)
  expect(result.shot.back).toBeLessThan(5.5)
  expect(Math.abs(result.shot.height - 1.7), '1.7 m up, not at eye height').toBeLessThan(0.2)
  expect(result.heads.length, 'both heads measured').toBe(2)
  for (const h of result.heads) {
    expect(h.inside, `${h.id}'s head on screen`).toBe(true)
    expect(h.hidden, `nothing in front of ${h.id}'s head`).toBe(null)
    expect(h.shown, `${h.id}'s head drawn (B's own head shows in the two-shot)`).toBe(true)
    expect(h.dist, `the camera is not inside ${h.id}`).toBeGreaterThan(0.6)
  }
  for (const [what, e] of [['in', result.in], ['back out', result.out]]) {
    expect(e, `eases ${what}`).toBeTruthy()
    expect(e.ms, `eases ${what}, not a cut`).toBeGreaterThan(300)
    expect(e.late, `eases ${what} in 0.4 s`).toBeLessThanOrEqual(1)
  }
  expect(result.after.mode).toBe('eye')
  expect(result.after.close).toBe(false)
  expect(result.after.convo).toBe(null)
  await saveVideo(page, 'T2-player-twoshot')
})
