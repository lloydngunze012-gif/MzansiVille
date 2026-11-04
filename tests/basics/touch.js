// Basics checklist helpers: the game is played by real touch only (taps and drags on the
// canvas and the buttons, as a finger would). window.mzansi* hooks are used only to READ
// where people are, to know where to put the finger and to measure what happened.
// Setup (not play): a new student is made in the creator by taps, then the save is moved
// on to 13:00 on day 1 (after the morning and the lecture) and the game opens at a place.
import { expect } from '@playwright/test'
import fs from 'node:fs'

export const OUT = 'docs/sprints/basics'
export const PHONE = { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, video: { mode: 'on', size: { width: 412, height: 915 } } }

export async function student(page, { spawn = 'quad', run = {}, gender } = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  const seen = new Set()
  page.on('pageerror', (e) => { if (!seen.has(e.message)) { seen.add(e.message); console.log('PAGE ERROR', e.message) } })
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('#name').fill('Thandeka')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  if (gender) await page.locator(`[data-gender="${gender}"]`).first().tap().catch(() => {})
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.evaluate((r) => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }, r)
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  }, run)
  await page.goto(`/?morning=0&spawn=${spawn}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // Everyone's model loaded: the count of bodies holds for a moment (people walking in
  // and out of view change it, so after 20 s a steady crowd is enough).
  const t0 = Date.now()
  let n = -1
  await expect.poll(async () => { const m = await page.evaluate(() => window.mzansiBodies('campus').length); const done = m > 0 && (m === n || (Date.now() - t0 > 20000 && m > 10)); n = m; return done }, { timeout: 150000, intervals: [1500] }).toBe(true)
  await page.waitForTimeout(1000)
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

// The arrow pad: tap an arrow (twice quickly: run), the middle button stops.
async function middleOf(page, sel) {
  const b = await page.locator(sel).boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
export const arrows = {
  at: (page, dir) => middleOf(page, `.arrow[data-dir="${dir}"]`),
  async go(page, f, dir, { run = false } = {}) {
    const p = await middleOf(page, `.arrow[data-dir="${dir}"]`)
    await f.tap(p.x, p.y)
    if (run) { await page.waitForTimeout(90); await f.tap(p.x, p.y) }
  },
  async stop(page, f) {
    const p = await middleOf(page, '.arrow-stop')
    await f.tap(p.x, p.y)
  },
  // Walk (or run) one way for ms, then stop.
  async walk(page, f, dir, ms, opts) {
    await arrows.go(page, f, dir, opts)
    await page.waitForTimeout(ms)
    await arrows.stop(page, f)
  },
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
