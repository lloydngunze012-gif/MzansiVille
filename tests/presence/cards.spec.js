// C2 (Piece 1a): two phones. A writes a bio on their card; B taps A on campus and A's
// card slides up (name, house, bio, tags); Wave and Add friend reach A; one tap
// closes; Report hides A from B. Touch only; hooks only READ.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { measureFps } from '../fps.js'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/presence'
const ROOM = `test-${Date.now().toString(36)}`
const W = 412
const H = 915
const GAP = 12
const A_ORIGIN = 'http://127.0.0.1:5173'
const B_ORIGIN = 'http://localhost:5173'

test.use({ viewport: { width: W * 2 + GAP, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, video: { mode: 'on', size: { width: W * 2 + GAP, height: H } } })
test.use({ actionTimeout: 30000, navigationTimeout: 60000 })
test.use({ launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(600000)

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
// B taps A where A stands on B's screen.
async function tapA(page, B, BX) {
  const o = (await B.evaluate(() => window.mzansiOthers()))[0]
  const s = await B.evaluate(([x, z]) => window.mzansiScreenOf(x, z, 1.0), [o.x, o.z])
  await (await finger(page, BX)).tap(s.x, s.y)
}

test('C2 tap another player: their card slides up; Wave, Add friend, Report', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
  await page.route('http://phones.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#0c0c10;display:flex;gap:${GAP}px;overflow:hidden">
    <iframe name="a" style="border:0;width:${W}px;height:${H}px"></iframe><iframe name="b" style="border:0;width:${W}px;height:${H}px"></iframe></body>` }))
  await page.goto('http://phones.test/')
  const A = page.frame({ name: 'a' })
  const B = page.frame({ name: 'b' })
  const BX = W + GAP

  // A fills in their card (bio, vibe, looking for) with the card's own form.
  await enrol(A, A_ORIGIN, 'Thandeka', 'female')
  await A.goto(`${A_ORIGIN}/?morning=0&room=${ROOM}#/profile`)
  await tapIn(page, A.locator('[data-act="pc-edit"]'))
  await A.locator('#pc-bio').fill('Law student, amapiano on Fridays')
  await A.locator('#pc-vibe').selectOption('Music head')
  await A.locator('#pc-looking').selectOption('Study buddy')
  await tapIn(page, A.locator('[data-act="pc-save"]'))
  await expect(A.locator('.pc-notice')).toBeVisible()
  await campus(A, A_ORIGIN)
  await enrol(B, B_ORIGIN, 'Kabelo', 'male')
  await campus(B, B_ORIGIN)
  await expect.poll(async () => (await B.evaluate(() => window.mzansiOthers())).length, { timeout: 30000 }).toBe(1)
  // (both start on the same spot by the Quad: A walks a few metres off, so B's finger
  // lands on A, not on B themself)
  const spot = await A.evaluate(() => {
    const p = window.mzansiPlayerPos()
    for (const [dx, dz] of [[-3, 2], [3, 2], [-3, -2], [3, -2], [0, 3.5], [-4, 0], [4, 0]]) {
      const s = window.mzansiScreenOf(p.x + dx, p.z + dz, 0)
      if (s && !s.behind && s.y > 240 && s.y < 640 && s.x > 40 && s.x < 372 && window.mzansiOpen(p.x + dx, p.z + dz)) return s
    }
    return null
  })
  await (await finger(page, 0)).tap(spot.x, spot.y)
  await page.waitForTimeout(6000) // (and A's card rides along with the next presence update)
  // (not a movement test: the fps is reported, the test isn't skipped below 20)
  console.log(`FPS ${await measureFps(A)}, ${await measureFps(B)}`)

  for (let i = 0; i < 6 && !(await B.locator('.pc-sheet .pcard').isVisible().catch(() => false)); i++) {
    await tapA(page, B, BX)
    await page.waitForTimeout(900)
  }
  await expect(B.locator('.pc-sheet .pcard')).toBeVisible({ timeout: 5000 })
  await page.waitForTimeout(600)
  const shown = { name: await B.locator('.pc-sheet .pc-name').textContent(), house: await B.locator('.pc-sheet .pc-house').textContent(), bio: await B.locator('.pc-sheet .pc-bio').textContent(), tags: await B.locator('.pc-sheet .pc-tags li').allTextContents() }
  await page.screenshot({ path: `${OUT}/C2-card-up.png` })

  // Wave: A hears it.
  await tapIn(page, B.locator('[data-pc="wave"]'))
  await expect(A.locator('#toast')).toContainText('Kabelo waved at you', { timeout: 8000 })
  await page.screenshot({ path: `${OUT}/C2-wave.png` })
  // Add friend: A hears it; B's button says Friends.
  await page.waitForTimeout(600)
  await tapA(page, B, BX)
  await tapIn(page, B.locator('[data-pc="friend"]'))
  await expect(A.locator('#toast')).toContainText('added you as a friend', { timeout: 8000 })
  const friendBtn = await B.locator('[data-pc="friend"]').textContent()
  // One tap on the scrim closes it.
  await (await finger(page, BX)).tap(200, 90)
  await expect(B.locator('.pc-sheet-wrap.on')).toHaveCount(0, { timeout: 3000 })
  // Report: A disappears from B's campus.
  await page.waitForTimeout(600)
  await tapA(page, B, BX)
  await tapIn(page, B.locator('[data-pc="report"]'))
  await tapIn(page, B.locator('[data-pc="report-Rude or hateful"]'))
  await expect.poll(async () => (await B.evaluate(() => window.mzansiOthers())).length, { timeout: 5000 }).toBe(0)
  await page.screenshot({ path: `${OUT}/C2-reported.png` })
  console.log('C2', JSON.stringify({ shown, friendBtn }))
  expect(shown.name).toBe('Thandeka')
  expect(shown.bio).toContain('amapiano on Fridays')
  expect(shown.tags.join(' ')).toContain('Music head')
  expect(friendBtn).toContain('Friends')
  const video = page.video()
  await page.close()
  if (video) await video.saveAs(`${OUT}/C2-cards.webm`)
})
