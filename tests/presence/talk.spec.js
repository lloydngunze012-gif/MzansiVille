// Piece 3, talking to each other. Two phones side by side in one page (a real player
// each, on their own test channel). Touch only; hooks only READ.
// T2 (part 1): B, in Eye view, taps A standing within 4 m: A's card slides up and B's
// camera eases into the two-shot (both heads on screen, about 2.5 m back, 1.7 m up);
// closing the card eases it back to B's Eye view.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { measureFps } from '../fps.js'
import { enrolUI } from '../enrol.js'

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
  await enrolUI(frame, { name: name, house: gender === 'male' ? 3 : 5, course: 1, gender: gender })
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

// T3 (part 2): player chat. B taps A, Say hi opens the text box; a quick phrase and free
// text show as a bubble over B's head on both phones (readable: 15 px), in both logs.
// Phone numbers, links and handles are taken out (saying why); a slur isn't sent;
// 120 characters at most. A answers from the Talk button; A's bubble fades out and is
// gone 8 s later. B blocks A from the log: A's body, bubbles and lines are gone for B.
// A walks over 15 m away: B's next line doesn't reach A. A reports B from the log: the
// report goes to Supabase with the message.
test('T3 player chat: Say hi, bubbles within 15 m for 8 s, log, quick phrases, filter, block, report', async ({ page }) => {
  const reports = []
  page.on('request', (req) => {
    if (req.method() !== 'POST' || !/report_player|client_errors/.test(req.url())) return
    const body = req.postData() || ''
    if (!/player_report|p_reason/.test(body)) return
    req.response().then((res) => reports.push({ url: req.url().replace(/^https:\/\/[^/]+/, ''), status: res?.status(), body: body.slice(0, 400) })).catch(() => {})
  })
  const { A, B, BX } = await twoPhones(page, 't3')
  const out = {}
  const aId = (await B.evaluate(() => window.mzansiOthers()))[0].id
  const bId = (await A.evaluate(() => window.mzansiOthers()))[0].id
  const lineOn = (frame, text) => frame.evaluate((t) => window.mzansiChat().some((m) => m.text.includes(t)), text)
  const bubbleOn = (frame, speaker) => frame.evaluate((s) => window.mzansiBubbles().find((b) => b.speaker === s) || null, speaker)

  // 1. B taps A; Say hi opens the text box (the card goes, the two-shot stays).
  for (let i = 0; i < 5 && !(await B.locator('.pc-sheet .pcard').isVisible().catch(() => false)); i++) {
    await tapOther(page, B, BX)
    await page.waitForTimeout(900)
  }
  await tapIn(page, B.locator('[data-pc="hi"]'))
  await expect(B.locator('.chat-panel')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(900)
  out.shotWhileChatting = await B.evaluate(() => { const s = window.mzansiShot(); return { convo: s.convo?.kind, eased: s.eased, back: s.back, height: s.height } })
  out.headsWhileChatting = (await B.evaluate((id) => window.mzansiHeads([id]), aId)).heads.map((h) => ({ id: h.id === 'player' ? 'B' : 'A', inside: h.inside, underHud: h.underHud, hidden: h.hidden }))
  // 2. A quick phrase: B's bubble on both phones, the line in both logs.
  await tapIn(page, B.locator('.chat-quick [data-say="Howzit! 👋"]'))
  await expect.poll(() => lineOn(A, 'Howzit'), { timeout: 8000 }).toBe(true)
  await page.waitForTimeout(400)
  out.quick = { onA: await lineOn(A, 'Howzit'), onB: await lineOn(B, 'Howzit'), bubbleOnA: await bubbleOn(A, bId), bubbleOnB: await bubbleOn(B, 'me') }
  await page.screenshot({ path: `${OUT}/T3-1-quick.png` })
  // 3. Free text with a phone number, a link and a handle: taken out, saying why.
  await page.waitForTimeout(1300)
  await B.locator('.chat-form input').fill('call me 082 555 1234 or ig: kabelo_99 see www.kabelo.co.za tonight')
  await tapIn(page, B.locator('.chat-form button[type="submit"]'))
  await expect.poll(() => lineOn(A, 'tonight'), { timeout: 8000 }).toBe(true)
  out.filtered = { note: await B.locator('.chat-note').textContent(), onA: (await A.evaluate(() => window.mzansiChat().map((m) => m.text))).find((t) => t.includes('tonight')) }
  // 4. A slur isn't sent at all.
  await page.waitForTimeout(1300)
  await B.locator('.chat-form input').fill('you kaffir')
  await tapIn(page, B.locator('.chat-form button[type="submit"]'))
  await page.waitForTimeout(2500)
  out.slur = { note: await B.locator('.chat-note').textContent(), onA: await lineOn(A, 'you '), onB: await lineOn(B, 'you ') }
  // 5. 120 characters at most.
  await B.locator('.chat-form input').fill('x'.repeat(150))
  out.max = (await B.locator('.chat-form input').inputValue()).length
  await B.locator('.chat-form input').fill('')
  await page.screenshot({ path: `${OUT}/T3-2-filter.png` })
  // 6. A answers from the Talk button: B sees A's bubble; it fades and is gone after 8 s.
  await tapIn(page, A.locator('.chat-btn'))
  await expect(A.locator('.chat-panel')).toBeVisible()
  await tapIn(page, A.locator('.chat-quick [data-say="Sharp sharp"]'))
  await expect.poll(() => lineOn(B, 'Sharp sharp'), { timeout: 8000 }).toBe(true)
  const seen = Date.now()
  await page.waitForTimeout(700)
  out.answer = { bubbleOnB: await bubbleOn(B, aId) }
  await page.screenshot({ path: `${OUT}/T3-3-answer.png` })
  await page.waitForTimeout(Math.max(0, 7400 - (Date.now() - seen)))
  out.answer.late = await bubbleOn(B, aId)
  await page.waitForTimeout(1800)
  out.answer.after = await bubbleOn(B, aId)
  out.answer.logStill = await lineOn(B, 'Sharp sharp')
  // 7. B blocks A (from the line in B's log): A's body, bubbles and lines are gone for B.
  await tapIn(page, B.locator(`.chat-log .chat-who[data-id="${aId}"]`).first())
  await expect(B.locator('.pc-sheet .pcard')).toBeVisible({ timeout: 5000 })
  await tapIn(page, B.locator('[data-pc="block"]'))
  await page.waitForTimeout(1500)
  await tapIn(page, A.locator('.chat-quick [data-say="Lekker vibes 🔥"]'))
  await page.waitForTimeout(3000)
  out.block = { othersOnB: (await B.evaluate(() => window.mzansiOthers())).length, lineOnB: await lineOn(B, 'Lekker'), bubbleOnB: await bubbleOn(B, aId), oldLinesOnB: await lineOn(B, 'Sharp sharp'), onA: await lineOn(A, 'Lekker'), chatStillOpenOnB: await B.locator('.chat-panel').isVisible() }
  await page.screenshot({ path: `${OUT}/T3-4-blocked.png` })
  // 8. A walks over 15 m away; B's next line doesn't reach A.
  await tapIn(page, A.locator('.chat-x'))
  const far = async () => A.evaluate(() => { const p = window.mzansiPlayerPos(); const o = window.mzansiOthers()[0]; return o ? Math.hypot(o.x - p.x, o.z - p.z) : null })
  for (let i = 0; i < 8 && (await far()) < 17; i++) {
    const spot = await A.evaluate(() => {
      const p = window.mzansiPlayerPos()
      const o = window.mzansiOthers()[0]
      const ax = p.x - o.x
      const az = p.z - o.z
      const d = Math.hypot(ax, az) || 1
      for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
        const ux = Math.cos(turn) * ax / d - Math.sin(turn) * az / d
        const uz = Math.sin(turn) * ax / d + Math.cos(turn) * az / d
        for (const m of [12, 9, 6]) {
          const x = p.x + ux * m
          const z = p.z + uz * m
          const s = window.mzansiScreenOf(x, z, 0)
          if (s && !s.behind && s.x > 30 && s.x < 382 && s.y > 230 && s.y < 700 && window.mzansiOpen(x, z)) return s
        }
      }
      return null
    })
    if (spot) await (await finger(page, 0)).tap(spot.x, spot.y)
    await page.waitForTimeout(4500)
  }
  out.range = { apart: +((await far()) || 0).toFixed(1) }
  await page.waitForTimeout(1300)
  await B.locator('.chat-form input').fill('Can you hear me')
  await tapIn(page, B.locator('.chat-form button[type="submit"]'))
  await page.waitForTimeout(3500)
  out.range.onA = await lineOn(A, 'Can you hear me')
  out.range.onB = await lineOn(B, 'Can you hear me')
  // 9. A reports B from the log (B's line goes with it): it reaches Supabase.
  await tapIn(page, A.locator('.chat-btn'))
  await tapIn(page, A.locator(`.chat-log .chat-who[data-id="${bId}"]`).last())
  await expect(A.locator('.pc-sheet .pcard')).toBeVisible({ timeout: 5000 })
  await tapIn(page, A.locator('[data-pc="report"]'))
  out.reportNote = await A.locator('.pc-report small').textContent().catch(() => '')
  await tapIn(page, A.locator('[data-pc="report-Rude or hateful"]'))
  await page.waitForTimeout(4000)
  out.reports = reports
  out.reportedHiddenOnA = (await A.evaluate(() => window.mzansiOthers())).length === 0
  await page.screenshot({ path: `${OUT}/T3-5-reported.png` })
  console.log('T3', JSON.stringify(out, null, 1))

  expect(out.shotWhileChatting.convo, 'the conversation goes on in the chat').toBe('player')
  expect(out.shotWhileChatting.eased, 'two-shot while chatting').toBe(true)
  for (const h of out.headsWhileChatting) expect(h.inside && !h.underHud && !h.hidden, `${h.id}'s head in the two-shot above the chat`).toBe(true)
  expect(out.quick.onA && out.quick.onB, 'the quick phrase in both logs').toBe(true)
  expect(out.quick.bubbleOnA?.shown, 'B’s bubble over B on A’s phone').toBe(true)
  expect(out.quick.bubbleOnA.font, 'readable at phone size').toBeGreaterThanOrEqual(15)
  expect(out.quick.bubbleOnB?.shown, 'B’s own bubble on B’s phone').toBe(true)
  expect(out.filtered.note).toContain('Phone numbers are taken out')
  expect(out.filtered.note).toContain('Links are taken out')
  expect(out.filtered.note).toContain('Social handles are taken out')
  expect(out.filtered.onA).not.toMatch(/\d{3}|kabelo_99|www\.|co\.za/)
  expect(out.slur.note).toContain('isn’t allowed')
  expect(out.slur.onA || out.slur.onB, 'a slur is never sent').toBe(false)
  expect(out.max).toBe(120)
  expect(out.answer.bubbleOnB?.shown, 'A’s bubble on B’s phone').toBe(true)
  expect(out.answer.late?.opacity ?? 0, 'fading near 8 s').toBeLessThan(1)
  expect(out.answer.after, 'gone after 8 s').toBe(null)
  expect(out.answer.logStill, 'still in the log').toBe(true)
  expect(out.block.othersOnB, 'blocked: A gone from B’s campus').toBe(0)
  expect(out.block.lineOnB || Boolean(out.block.bubbleOnB) || out.block.oldLinesOnB, 'blocked: no bubbles or lines from A').toBe(false)
  expect(out.block.onA, 'A still sees their own line').toBe(true)
  expect(out.range.apart).toBeGreaterThan(15)
  expect(out.range.onB).toBe(true)
  expect(out.range.onA, 'out of earshot past 15 m').toBe(false)
  expect(out.reportNote, 'the reported line is shown').toContain('tonight')
  expect(out.reports.some((r) => r.status >= 200 && r.status < 300 && /tonight/.test(r.body)), 'the report reached Supabase with the message').toBe(true)
  expect(out.reportedHiddenOnA).toBe(true)
  await saveVideo(page, 'T3-chat')
})
