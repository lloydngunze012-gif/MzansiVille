// Chat sprint (owner, 11 Nov): the testers' evening, on three phones. Each phone is its own browser context (its
// own identity); the nudges travel over the real Supabase Realtime on a test room of its own; the chat's server
// is supabase/chat.sql on a real Postgres in this process (tests/chat-server.js), so the limits, membership and
// blocks are the real ones and nothing is written to the live project.
//   Two phones DM with pings both ways (never for the thread that is open); a third joins The Quad and all three
//   see each other's messages in the same order under the pinned topic; a flood is refused politely and reaches
//   nobody; a blocked player's messages vanish, both ways, and the third still sees everyone.
// Screenshots at 390 px: docs/sprints/chat/ (thread-list, dm, quad, ping-dm).
// Run: npx playwright test tests/presence/chat.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/chat'
const ROOM = `test-chat-${Date.now().toString(36)}`
test.setTimeout(420000)
test.use({ actionTimeout: 20000 })

let server
async function phone(browser, name, preset) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  await server.routeChat(ctx)
  const page = await ctx.newPage()
  await atGate(page, { query: `&chat=1&room=${ROOM}`, name, preset })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  return { ctx, page, name }
}
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const bodies = async (page) => (await chat(page)).lines.map((l) => l.body)
const sheet = (page) => page.locator('.cht-sheet')
const ping = (page) => page.locator('.cht-ping')
async function send(page, text) {
  await page.locator('.cht-form input').fill(text)
  await page.locator('.cht-form button[type="submit"]').tap()
}
async function openQuad(page) {
  if (!(await sheet(page).isVisible())) await page.locator('.tb-chat').tap()
  if ((await sheet(page).getAttribute('data-view')) === 'thread') await page.locator('.cht-back').tap()
  await page.locator('.cht-row[data-thread="quad"]').tap()
  await expect(page.locator('.cht-pin')).toBeVisible()
}
async function longPress(page, loc) {
  const b = await loc.boundingBox()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 1, radiusX: 8, radiusY: 8, force: 1 }] })
  await expect(page.locator('.cht-acts')).toBeVisible({ timeout: 5000 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  // (the menu takes no tap until the finger is up and a moment has passed)
  await page.waitForTimeout(500)
  await expect(page.locator('.cht-acts')).toBeVisible()
}

test('DMs with pings both ways; three in The Quad in order; a flood refused; a blocked player vanishes', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  const topic = JSON.parse(fs.readFileSync('data/campusville/topics.json', 'utf8'))[0]
  const a = await phone(browser, 'Ayanda', 'q-naledi')
  const b = await phone(browser, 'Bonga', 'q-thabo')
  for (const p of [a, b]) await expect.poll(async () => (await p.page.evaluate(() => window.mzansiPresence())).count, { timeout: 40000 }).toBe(2)

  // ---- 1. A messages B from "Here now": B is pinged, the banner opens the DM ----
  await a.page.locator('.tb-chat').tap()
  await a.page.locator('.cht-person', { hasText: 'Bonga' }).tap()
  await expect(sheet(a.page)).toHaveAttribute('data-view', 'thread')
  await expect(a.page.locator('.cht-title b')).toHaveText('Bonga')
  await send(a.page, 'Howzit Bonga, you on campus?')
  await expect(a.page.locator('.cht-lines li.me .cht-text')).toHaveText(['Howzit Bonga, you on campus?'])
  await expect(ping(b.page)).toBeVisible({ timeout: 15000 })
  await expect(ping(b.page)).toContainText('Ayanda')
  await expect(ping(b.page)).toContainText('Howzit Bonga')
  await expect(b.page.locator('.tb-chat [data-chat-unread]')).toHaveText('1')
  await b.page.screenshot({ path: `${OUT}/ping-dm.png` })
  await ping(b.page).tap()
  await expect(sheet(b.page)).toHaveAttribute('data-view', 'thread')
  await expect(b.page.locator('.cht-lines li.them .cht-text')).toHaveText(['Howzit Bonga, you on campus?'])
  await expect(b.page.locator('.tb-chat [data-chat-unread]')).toBeHidden()
  // B answers: A has the thread open, so the line arrives with no ping.
  await send(b.page, 'Sharp! By the gate')
  await expect(a.page.locator('.cht-lines li.them .cht-text')).toHaveText(['Sharp! By the gate'], { timeout: 15000 })
  await expect(ping(a.page)).toBeHidden()
  expect(await ping(a.page).getAttribute('data-n'), 'never a ping for the open thread').toBe(null)
  // ---- 2. The other way: A closes the chat, B writes again, A is pinged ----
  await a.page.locator('.cht-x').tap()
  await b.page.waitForTimeout(2100)
  await send(b.page, 'Coffee at Lifecup later?')
  await expect(ping(a.page)).toBeVisible({ timeout: 15000 })
  await expect(ping(a.page)).toContainText('Bonga')
  await expect(ping(a.page)).toContainText('Coffee at Lifecup later?')
  await ping(a.page).tap()
  await expect(a.page.locator('.cht-lines li .cht-text')).toHaveText(['Howzit Bonga, you on campus?', 'Sharp! By the gate', 'Coffee at Lifecup later?'])
  await a.page.waitForTimeout(400)
  await a.page.screenshot({ path: `${OUT}/dm.png` })

  // ---- 3. A third player arrives and is in The Quad at once; all three talk under the pinned topic ----
  const c = await phone(browser, 'Carla', 'q-amy')
  const said = []
  const say = async (p, text) => {
    await send(p.page, text)
    said.push(text)
    // (everyone has it before the next one is sent)
    for (const q of [a, b, c]) await expect.poll(() => bodies(q.page), { timeout: 20000, message: `"${text}" on ${q.name}'s phone` }).toEqual(said)
  }
  await a.page.locator('.cht-back').tap()
  await expect(a.page.locator('.cht-row')).toHaveCount(2)
  await expect(a.page.locator('.cht-row').first().locator('b')).toHaveText('Bonga') // (newest first)
  await a.page.waitForTimeout(300)
  await a.page.screenshot({ path: `${OUT}/thread-list.png` })
  for (const p of [a, b, c]) await openQuad(p.page)
  await expect(c.page.locator('.cht-pin')).toContainText(topic)
  await say(a, 'Fair. Petrol is not cheap')
  await say(b, 'Robbery! It was R12 last year')
  await say(c, 'Depends if the taxi is full')
  await say(a, 'R15 and you get a seat, I am happy')
  await say(c, 'Walking is free, just saying')
  // (the same lines, in the same order, on all three; names on the others' lines)
  await expect(c.page.locator('.cht-lines li.them .cht-name')).toHaveText(['Ayanda', 'Bonga', 'Ayanda'])
  await expect(c.page.locator('.cht-lines li.me')).toHaveCount(2)
  await c.page.waitForTimeout(300)
  await c.page.screenshot({ path: `${OUT}/quad.png` })

  // ---- 4. A flood: the second message at once is refused politely and reaches nobody ----
  await c.page.waitForTimeout(2100)
  await send(c.page, 'one')
  said.push('one')
  await expect.poll(() => bodies(c.page), { timeout: 10000 }).toEqual(said)
  // (straight after: well inside the server's 2 seconds)
  await send(c.page, 'two')
  await expect(c.page.locator('.cht-note')).toContainText('Slow down')
  await expect(c.page.locator('.cht-form input'), 'the words stay in the box').toHaveValue('two')
  expect(server.calls.filter((x) => x.fn === 'chat_send').at(-1).reason, 'refused by the server').toBe('slow')
  for (const q of [a, b]) await expect.poll(() => bodies(q.page), { timeout: 20000 }).toEqual(said)
  await a.page.waitForTimeout(2500)
  for (const q of [a, b, c]) expect(await bodies(q.page), `nothing of the flood on ${q.name}'s phone`).toEqual(said)

  // ---- 5. A blocks B from one of B's messages: B's lines vanish for A, A's for B; C still sees everyone ----
  const bId = (await chat(b.page)).lines.find((l) => l.me).sender
  const aId = (await chat(a.page)).lines.find((l) => l.me).sender
  await longPress(a.page, a.page.locator(`.cht-bub[data-sender="${bId}"]`).first())
  await expect(a.page.locator('.cht-acts')).toContainText('Block Bonga')
  await a.page.locator('.cht-acts [data-ct="block"]').tap()
  await expect.poll(async () => (await chat(a.page)).lines.some((l) => l.sender === bId), { timeout: 10000 }).toBe(false)
  await expect.poll(async () => (await chat(b.page)).lines.some((l) => l.sender === aId), { timeout: 30000, message: 'A\'s lines go from B\'s phone too' }).toBe(false)
  expect(await bodies(c.page), 'the third player still sees everyone').toEqual(said)
  expect((await chat(a.page)).threads.some((t) => t.kind === 'dm'), 'the DM leaves A\'s list').toBe(false)
  // B says something more: C hears it, A does not (no line, no ping).
  await b.page.waitForTimeout(2100)
  await send(b.page, 'Anyone else coming?')
  await expect.poll(async () => (await bodies(c.page)).at(-1), { timeout: 20000 }).toBe('Anyone else coming?')
  await a.page.locator('.cht-x').tap()
  await a.page.waitForTimeout(4000)
  await expect(ping(a.page)).toBeHidden()
  expect((await chat(a.page)).unread).toBe(0)
  await a.page.locator('.tb-chat').tap()
  await expect(a.page.locator('.cht-row[data-thread="quad"] .cht-last')).not.toContainText('Anyone else')
  for (const p of [a, b, c]) await p.ctx.close()
})
