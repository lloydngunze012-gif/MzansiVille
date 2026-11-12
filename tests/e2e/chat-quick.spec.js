// Chat sprint (owner, 11 Nov), one phone, in the quick project. The chat's server is supabase/chat.sql on a real
// Postgres in this process (tests/chat-server.js); another player ("Bonga") is played straight on that server.
//   Q1 The chat button opens the thread list (The Quad with its pinned topic, never a dialog, at most 70% of the
//      screen); a thread opens with one tap and back returns; a message sends; a second at once is refused
//      politely by the server; a message from Bonga pings (banner + badge) with the sheet closed, and the banner
//      opens the thread; you keep walking with the sheet open and stay in view above it; long-press: Report, Block.
//   Q2 The chat stays open while you walk from the Main Gate to Lifecup in SunnyBay, and still sends there.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, intoCity } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/chat'
const ROOM = `test-chatq-${Date.now().toString(36)}`
const BONGA = { p_id: 'bonga-test-player-0001', p_secret: 'bonga-secret-0123456789abcdef' }
test.setTimeout(300000)
test.use({ actionTimeout: 20000 })

let server
test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  await server.call('chat_sync', { ...BONGA, p_name: 'Bonga Dube', p_handle: 'bonga_d', p_house: 'Peak', p_look: { gender: 'male', skin: 'deep', hair: 'fade', outfit: 'hoodie' } })
})
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const sheet = (page) => page.locator('.cht-sheet')
// (the server's 2 s gap is on its own clock: Bonga's earlier lines move back instead of the test waiting)
const bongaSays = async (thread, text) => {
  await server.rows("update chat_lines set at = at - interval '3 seconds' where sender = $1", [BONGA.p_id])
  const r = await server.call('chat_send', { ...BONGA, p_thread: thread, p_body: text })
  expect(r.body.ok, `Bonga's line: ${JSON.stringify(r.body)}`).toBe(true)
}
async function send(page, text) {
  await page.locator('.cht-form input').fill(text)
  await page.locator('.cht-form button[type="submit"]').tap()
}
// A finger held on a message for longer than the long-press time.
async function longPress(page, loc) {
  const b = await loc.boundingBox()
  const cdp = await page.context().newCDPSession(page)
  const pt = [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt })
  await expect(page.locator('.cht-acts')).toBeVisible({ timeout: 5000 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // (the menu takes no tap until the finger is up and a moment has passed)
  await page.waitForTimeout(500)
  await expect(page.locator('.cht-acts')).toBeVisible()
}

test('Q1 the chat sheet: list, The Quad and its pinned topic, send, the polite refusal, the ping, walking, report and block', async ({ page }) => {
  await server.routeChat(page)
  await atGate(page, { query: `&chat=1&room=${ROOM}-1`, name: 'Ayanda' })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  const topic = JSON.parse(fs.readFileSync('data/campusville/topics.json', 'utf8'))[0]

  // The list: one tap on the top bar's chat button.
  await page.locator('.tb-chat').tap()
  await expect(sheet(page)).toBeVisible()
  await expect(sheet(page)).toHaveAttribute('data-view', 'list')
  const quadRow = page.locator('.cht-row[data-thread="quad"]')
  await expect(quadRow.locator('b')).toHaveText('The Quad')
  await expect(quadRow.locator('.cht-last')).toContainText(topic)
  expect(await page.locator('.cht-sheet[role="dialog"], .cht-sheet [role="dialog"]').count(), 'never a dialog: you keep walking').toBe(0)
  // One tap opens the thread; the pinned topic is on top; back returns to the list.
  await quadRow.tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  await expect(page.locator('.cht-pin')).toContainText(topic)
  await page.locator('.cht-back').tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'list')
  await quadRow.tap()
  const box = await sheet(page).boundingBox()
  expect(box.height, 'at most 70% of the screen').toBeLessThanOrEqual(844 * 0.7 + 1)
  expect(box.width, 'a centred card, not a strip').toBeLessThanOrEqual(420)

  // Send: your bubble on the right, with the time.
  await send(page, 'Fair, if the taxi is full')
  await expect(page.locator('.cht-lines li.me .cht-text')).toHaveText(['Fair, if the taxi is full'])
  await expect(page.locator('.cht-lines li.me .cht-time').first()).toHaveText(/^\d\d:\d\d$/)
  await expect(page.locator('.cht-form input')).toHaveValue('')
  // A second one at once: the server refuses it, politely, and the words stay in the box.
  await send(page, 'and another one')
  await expect(page.locator('.cht-note')).toContainText('Slow down')
  await expect(page.locator('.cht-form input')).toHaveValue('and another one')
  expect((await chat(page)).lines.map((l) => l.body)).toEqual(['Fair, if the taxi is full'])
  expect(server.calls.filter((c) => c.fn === 'chat_send').map((c) => c.reason)).toEqual(['', 'slow'])
  // A phone number, a link and a slur: taken out with the reason, or not sent at all.
  await page.waitForTimeout(2100)
  await send(page, 'call me 082 555 1234 at www.taxi.co.za tonight')
  await expect(page.locator('.cht-note')).toContainText('Phone numbers are taken out')
  await expect(page.locator('.cht-lines li.me .cht-text').last()).toHaveText('call me at tonight')
  await send(page, 'you kaffir')
  await expect(page.locator('.cht-note')).toContainText('isn’t allowed')
  expect((await chat(page)).lines).toHaveLength(2)
  expect((await page.locator('.cht-form input').getAttribute('maxlength'))).toBe('300')

  // You keep walking with the sheet open, and you stand in view in the strip above it.
  const before = await page.evaluate(() => window.mzansiPlayerPos())
  const band = await page.evaluate(() => ({ top: document.querySelector('.g-hud').getBoundingClientRect().bottom, bottom: document.querySelector('.cht-sheet').getBoundingClientRect().top }))
  await expect.poll(async () => { const p = await page.evaluate(() => { const q = window.mzansiPlayerPos(); return window.mzansiScreenOf(q.x, q.z, 1) }); return p.y > band.top && p.y < band.bottom }, { timeout: 10000, message: 'the player is in view above the sheet' }).toBe(true)
  const spot = await page.evaluate(([top, bottom]) => {
    const p = window.mzansiPlayerPos()
    for (const [dx, dz] of [[0, -5], [-4, -3], [4, -3], [-5, 0], [5, 0], [0, -8], [-3, -6], [3, -6]]) {
      const s = window.mzansiScreenOf(p.x + dx, p.z + dz, 0)
      if (s && !s.behind && s.y > top + 24 && s.y < bottom - 24 && s.x > 30 && s.x < 360 && window.mzansiOpen(p.x + dx, p.z + dz)) return s
    }
    return null
  }, [band.top, band.bottom])
  expect(spot, 'open ground in view above the sheet').toBeTruthy()
  await page.touchscreen.tap(spot.x, spot.y)
  await expect.poll(async () => { const p = await page.evaluate(() => window.mzansiPlayerPos()); return Math.hypot(p.x - before.x, p.z - before.z) }, { timeout: 15000 }).toBeGreaterThan(1.5)
  await expect(sheet(page)).toBeVisible()
  await page.screenshot({ path: `${OUT}/quad-pinned-topic.png` })

  // Closed: a line from Bonga pings (the sync every 25 s is the net when no nudge comes: Bonga has no phone here).
  await page.locator('.cht-x').tap()
  await expect(sheet(page)).toBeHidden()
  await bongaSays('quad', 'Robbery! It was R12 last year')
  const ping = page.locator('.cht-ping')
  await expect(ping).toBeVisible({ timeout: 40000 })
  await expect(ping).toContainText('Bonga · The Quad')
  await expect(ping).toContainText('Robbery! It was R12 last year')
  await expect(page.locator('.tb-chat [data-chat-unread]')).toHaveText('1')
  const pb = await ping.boundingBox()
  expect(pb.width).toBeLessThanOrEqual(420)
  // (Chat V2, 12 Nov: the banner drops in just under the top bar, not over it)
  const barBottom = await page.locator('#app .g-hud.tb').evaluate((el) => el.getBoundingClientRect().bottom)
  expect(Math.abs(pb.y - barBottom), 'just under the top bar').toBeLessThanOrEqual(2)
  await page.screenshot({ path: `${OUT}/ping-banner.png` })
  // Tapping it opens the thread; theirs is on the left with the name; the badge clears.
  await ping.tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  await expect(page.locator('.cht-lines li.them .cht-text')).toHaveText(['Robbery! It was R12 last year'])
  await expect(page.locator('.cht-lines li.them .cht-name')).toHaveText('Bonga Dube')
  await expect(page.locator('.tb-chat [data-chat-unread]')).toBeHidden()
  // Never a ping for the thread that is open.
  const pings = await ping.getAttribute('data-n')
  await bongaSays('quad', 'Walking is free though')
  await expect(page.locator('.cht-lines li.them .cht-text')).toHaveText(['Robbery! It was R12 last year', 'Walking is free though'], { timeout: 40000 })
  await expect(ping).toBeHidden()
  expect(await ping.getAttribute('data-n')).toBe(pings)

  // Long-press a message of theirs: Report (the server keeps the text), then Block (their messages vanish).
  await longPress(page, page.locator('.cht-lines li.them .cht-bub').first())
  await page.locator('.cht-acts [data-ct="report"]').tap()
  await expect(page.locator('.cht-note')).toContainText('moderator')
  await expect.poll(async () => (await server.rows('select body from chat_line_reports')).map((r) => r.body), { timeout: 10000 }).toEqual(['Robbery! It was R12 last year'])
  await longPress(page, page.locator('.cht-lines li.them .cht-bub').first())
  await page.locator('.cht-acts [data-ct="block"]').tap()
  await expect(page.locator('.cht-lines li.them')).toHaveCount(0)
  await expect(page.locator('.cht-lines li.me')).toHaveCount(2)
  await expect.poll(async () => (await server.rows('select blocked from chat_blocks')).map((r) => r.blocked), { timeout: 10000 }).toEqual([BONGA.p_id])
  // ...and nothing more from them: no ping, no line.
  await page.locator('.cht-x').tap()
  await bongaSays('quad', 'Hello? Anyone?')
  await page.waitForTimeout(27000)
  await expect(ping).toBeHidden()
  expect((await chat(page)).unread).toBe(0)
})

test('Q2 the chat stays open while you walk from the Main Gate to Lifecup', async ({ page }) => {
  await server.routeChat(page)
  await atGate(page, { query: `&chat=1&room=${ROOM}-2`, name: 'Carla', preset: 'q-amy' })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  await intoCity(page)
  await page.locator('.tb-chat').tap()
  await page.locator('.cht-row[data-thread="quad"]').tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  await send(page, 'Walking to Lifecup, who is there?')
  await expect(page.locator('.cht-lines li.me')).toHaveCount(1)
  const door = await page.evaluate(() => window.mzansiCity.plan.LOTS.find((l) => l.id === 'lifecup').door)
  const here = async () => (await page.evaluate(() => window.mzansiCity.info())).player
  const start = await here()
  // Down Varsity Road, then across to the cafe's door: taps on the street in the strip above the sheet.
  const stops = [[0.5, door.z + 5], [door.x, door.z + 4]]
  let leg = 0
  for (let i = 0; i < 80 && leg < stops.length; i++) {
    const [x, z] = await here()
    const [tx, tz] = stops[leg]
    const d = Math.hypot(tx - x, tz - z)
    if (d < 3) { leg += 1; continue }
    const tap = await page.evaluate(([px, pz, ax, az, dist]) => {
      const top = document.querySelector('.g-hud').getBoundingClientRect().bottom
      const bottom = document.querySelector('.cht-sheet').getBoundingClientRect().top
      for (const step of [14, 11, 8, 6, 4, 2.5]) {
        const k = Math.min(step, dist) / dist
        const s = window.mzansiCity.px(px + (ax - px) * k, 0, pz + (az - pz) * k)
        if (!s.behind && s.y > top + 16 && s.y < bottom - 16 && s.x > 16 && s.x < 374) return s
      }
      return null
    }, [x, z, tx, tz, d])
    expect(tap, `a spot on the street in view above the sheet (leg ${leg}, ${d.toFixed(1)} m to go)`).toBeTruthy()
    await page.touchscreen.tap(tap.x, tap.y)
    await page.waitForTimeout(900)
    await expect(sheet(page), 'the chat stays open on the way').toBeVisible()
  }
  const end = await here()
  expect(Math.hypot(end[0] - door.x, end[1] - door.z), 'at Lifecup').toBeLessThan(8)
  expect(Math.hypot(end[0] - start[0], end[1] - start[1]), 'a real walk').toBeGreaterThan(80)
  // Still the same thread, and it still sends.
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  await expect(page.locator('.cht-pin')).toBeVisible()
  await send(page, 'Made it. Coffee?')
  await expect(page.locator('.cht-lines li.me .cht-text')).toHaveText(['Walking to Lifecup, who is there?', 'Made it. Coffee?'])
  await page.screenshot({ path: `${OUT}/walking-lifecup-chat-open.png` })
  // The ping fires in SunnyBay too: the sheet closed, a line from Bonga, the banner over the city.
  await page.locator('.cht-x').tap()
  await bongaSays('quad', 'Flat white for me')
  await expect(page.locator('.cht-ping')).toBeVisible({ timeout: 40000 })
  await expect(page.locator('.cht-ping')).toContainText('Flat white for me')
  expect(await page.evaluate(() => document.body.dataset.city), 'still in SunnyBay').toBe('1')
})
