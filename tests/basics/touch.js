// Basics checklist helpers: the game is played by real touch only (taps and drags on the
// canvas and the buttons, as a finger would). window.mzansi* hooks are used only to READ
// where people are, to know where to put the finger and to measure what happened.
// Setup (not play): a new student is made in the creator by taps, then the save is moved
// on to 13:00 on day 1 (after the morning and the lecture) and the game opens at a place.
import { expect } from '@playwright/test'
import fs from 'node:fs'
import { fpsGate } from '../fps.js'
import { enrolUI } from '../enrol.js'

export const OUT = 'docs/sprints/basics'
// (on the real GPU: the software one draws about 5 fps, below the movement tests' 20)
export const PHONE = { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, video: { mode: 'on', size: { width: 412, height: 915 } }, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } }

export async function student(page, { spawn = 'quad', run = {}, gender, query = '', avatar } = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  const seen = new Set()
  page.on('pageerror', (e) => { if (!seen.has(e.message)) { seen.add(e.message); console.log('PAGE ERROR', e.message) } })
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandeka', house: 1, course: 1, gender: gender })
  await page.waitForURL(/#\/play/)
  await page.evaluate(([r, look]) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, r)
    // (setup: a look the creator can make, e.g. { body: 'curvy' })
    if (look) save.run.character.avatar = { ...save.run.character.avatar, ...look }
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, [run, avatar])
  await page.goto(`/?morning=0&spawn=${spawn}${query}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // Everyone's model loaded: the count of bodies holds for a moment (people walking in
  // and out of view change it, so after 20 s a steady crowd is enough).
  const t0 = Date.now()
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m > 0 && (m === n || (Date.now() - t0 > 20000 && m > 10)); n = m; return done }, { timeout: 150000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1000)
  // Below 20 fps this test can't pass or fail: INCONCLUSIVE (tests/fps.js).
  await fpsGate(page)
}

// A finger on the glass (Chrome DevTools touch events: the page sees touch and pointer
// events exactly as from a phone).
export async function finger(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 })) })
  return {
    down: (x, y) => send('touchStart', [[x, y]]),
    move: (x, y) => send('touchMove', [[x, y]]),
    up: () => send('touchEnd', []),
    async tap(x, y) { await send('touchStart', [[x, y]]); await page.waitForTimeout(60); await send('touchEnd', []) },
    // A drag along points, over ms milliseconds.
    async drag(points, ms = 600) {
      await send('touchStart', [points[0]])
      const steps = Math.max(2, Math.round(ms / 40))
      for (let i = 1; i <= steps; i++) {
        const k = (i / steps) * (points.length - 1)
        const a = points[Math.floor(k)]
        const b = points[Math.min(points.length - 1, Math.floor(k) + 1)]
        const t = k - Math.floor(k)
        await send('touchMove', [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]])
        await page.waitForTimeout(40)
      }
      await send('touchEnd', [])
    },
  }
}

// A point on the screen this far (px) from where the player stands, kept on the open
// part of the screen (below the HUD, above the buttons).
export async function nearMe(page, dx, dy) {
  const me = await page.evaluate(() => { const p = window.mzansiPlayerPos(); return window.mzansiScreenOf(p.x, p.z, 0.2) })
  return { x: Math.min(392, Math.max(20, me.x + dx)), y: Math.min(760, Math.max(300, me.y + dy)) }
}
// Walk with a finger: touch the ground this far from the player, wait ms, then tap
// yourself to stop.
export async function fingerWalk(page, f, dx, dy, ms) {
  const p = await nearMe(page, dx, dy)
  await f.tap(p.x, p.y)
  await page.waitForTimeout(ms)
}

// A ground point on screen this far (m) from the player, in an open direction the
// camera can see (read only: where the finger should go).
export async function groundAhead(page, metres) {
  return page.evaluate((m) => {
    const p = window.mzansiPlayerPos()
    for (const a of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2, 2.7, -2.7, 3.1]) {
      const x = p.x + Math.sin(Math.PI + a) * m
      const z = p.z + Math.cos(Math.PI + a) * m
      const s = window.mzansiScreenOf(x, z, 0)
      // (open ground only: not on the stage, a bench or a wall)
      if (s && !s.behind && s.x > 30 && s.x < 382 && s.y > 170 && s.y < 780 && window.mzansiOpen(x, z)) return { x, z, s }
    }
    return null
  }, metres)
}

// Reads only.
export const read = {
  pos: (page) => page.evaluate(() => window.mzansiPlayerPos()),
  state: (page) => page.evaluate(() => document.querySelector('#world').dataset.playerState),
  pose: (page) => page.evaluate(() => window.mzansiPlayerPose()),
  screenOf: (page, x, z, y = 0) => page.evaluate(([a, b, c]) => window.mzansiScreenOf(a, b, c), [x, z, y]),
  person: (page, id) => page.evaluate((i) => window.mzansiPersonOnScreen(i), id),
  people: (page) => page.evaluate(() => window.mzansiPeople()),
  queue: (page, which) => page.evaluate((w) => window.mzansiQueue(w), which),
  body: (page) => page.evaluate(() => { const b = window.mzansiBodies('campus', 'player')[0]; return b && { yaw: b.yaw, ry: b.ry ?? null } }),
  rot: (page) => page.evaluate(() => window.mzansiPlayerRot()),
}

export async function saveVideo(page, name) {
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/${name}.webm`)
}

// Tap a button like a finger: once it's on screen and has stopped sliding in.
export async function tapOn(page, f, loc) {
  await loc.waitFor({ state: 'attached', timeout: 15000 })
  await loc.scrollIntoViewIfNeeded()
  let b = await loc.boundingBox()
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(120)
    const c = await loc.boundingBox()
    if (c && b && Math.abs(c.x - b.x) < 1 && Math.abs(c.y - b.y) < 1) break
    b = c
  }
  await f.tap(b.x + b.width / 2, b.y + b.height / 2)
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
export const DEG = 180 / Math.PI
