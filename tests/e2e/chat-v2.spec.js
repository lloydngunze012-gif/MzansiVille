// Chat V2: familiar and clear (owner, 11 Nov), one phone, in the quick project. The server is supabase/chat.sql on
// a real Postgres in this process (tests/chat-server.js); "Bonga" is played straight on that server.
//   V1 The palette rule (docs/palette.md, tests/palette.js) on the screens that are always there: campus, the menu,
//      the Caf, SunnyBay. No purple or navy buttons, yellow and light surfaces carry ink, dark carries white, every
//      pair 4.5:1 or better.
//   V2 The chat list: white rows, what each row is (the Quad's hot topic, "Interest group", "Group"), a yellow
//      unread badge with ink text; the palette holds on the whole sheet.
//   V3 A DM: the wall with our doodles, white and pale-green bubbles with ink text and the time inside, "online" for
//      a friend both ways, a round yellow send button, "typing…" (at most one signal every 3 s; never in the Quad).
//   V4 A group: names in the bubbles, the member count, "Bonga is typing…".
//   V5 A new message: a white banner just under the top bar, edge to edge, for 5 s, one buzz; the chat button's
//      count is bigger and pulses until the chat is opened.
// Screenshots at 390 px (not committed): docs/sprints/chat-v2/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, intoCity } from '../city.js'
import { chatServer } from '../chat-server.js'
import { paletteFaults } from '../palette.js'

const OUT = 'docs/sprints/chat-v2'
const ROOM = `test-chatv2-${Date.now().toString(36)}`
const BONGA = { p_id: 'bonga-test-player-0001', p_secret: 'bonga-secret-0123456789abcdef' }
test.setTimeout(300000)
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })

let server
test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  await server.call('chat_sync', { ...BONGA, p_name: 'Bonga Dube', p_handle: 'bonga_d', p_house: 'Peak', p_look: { gender: 'male', skin: 'deep', hair: 'fade', outfit: 'hoodie' } })
})
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const sheet = (page) => page.locator('.cht-sheet')
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const syncNow = (page) => page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const bongaSays = async (thread, text) => {
  await server.rows("update chat_lines set at = at - interval '3 seconds' where sender = $1", [BONGA.p_id])
  const r = await server.call('chat_send', { ...BONGA, p_thread: thread, p_body: text })
  expect(r.body.ok, `Bonga's line: ${JSON.stringify(r.body)}`).toBe(true)
}
const style = (loc, props) => loc.evaluate((el, list) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return Object.fromEntries([...list.map((p) => [p, cs[p]]), ['w', Math.round(r.width)], ['h', Math.round(r.height)], ['x', Math.round(r.left)], ['y', Math.round(r.top)]]) }, props)
const INK = 'rgb(28, 25, 21)'
const YELLOW = 'rgb(240, 196, 0)'
const WHITE = 'rgb(255, 255, 255)'

// A phone on campus with the chat up, Bonga a friend both ways, a DM, a group of two and an interest group.
async function setUp(page, name) {
  await server.routeChat(page)
  const errors = await atGate(page, { query: `&chat=1&room=${ROOM}-${name}`, name })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  const mine = await me(page)
  await server.call('chat_friend', { ...mine, p_other: BONGA.p_id })
  await server.call('chat_friend', { ...BONGA, p_other: mine.p_id })
  await server.call('chat_sync', BONGA)
  const dm = (await server.call('chat_dm', { ...BONGA, p_other: mine.p_id })).body.thread
  const group = (await server.call('chat_group_create', { ...mine, p_name: `Study crew ${name}` })).body.thread
  await server.call('chat_group_add', { ...mine, p_thread: group, p_other: BONGA.p_id })
  await server.call('chat_interests', { ...mine, p_list: ['music'] })
  await syncNow(page)
  return { errors, mine, dm: typeof dm === 'string' ? dm : dm.id, group: typeof group === 'string' ? group : group.id }
}

test('V1 the palette rule holds on campus, in the menu, in the Caf and in SunnyBay', async ({ page }) => {
  const errors = await atGate(page)
  expect(await paletteFaults(page), 'campus').toEqual([])
  await page.locator('.tb-menu').tap()
  await expect(page.locator('.g-menu')).toBeVisible()
  expect(await paletteFaults(page), 'the menu').toEqual([])
  await page.locator('.g-scrim[data-act="gear"]').tap({ position: { x: 12, y: 420 } })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-walk-to', { detail: 'cafeteria' })))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.waitForTimeout(500)
  expect(await paletteFaults(page), 'the Caf').toEqual([])
  await page.locator('.caf-out').tap()
  await expect(page.locator('#world')).toHaveAttribute('data-on', '1', { timeout: 60000 })
  await page.evaluate(() => window.mzansiPlace(0, 99, 0, 104))
  await intoCity(page)
  expect(await paletteFaults(page), 'SunnyBay').toEqual([])
  expect(errors).toEqual([])
})

test('V2-V4 the list with its labels, a DM and a group: bubbles, the wall, online, the send button, typing', async ({ page }) => {
  const { errors, dm, group } = await setUp(page, 'Ayanda')
  await bongaSays(dm, 'Howzit! You coming to the Quad later?')
  await bongaSays(group, 'I have the notes for chapter 2')
  await syncNow(page)

  // ---- V2 the list ----
  await page.locator('.tb-chat').tap()
  await expect(sheet(page)).toBeVisible()
  const topic = JSON.parse(fs.readFileSync('data/campusville/topics.json', 'utf8'))[0]
  await expect(page.locator('.cht-row[data-thread="quad"] .cht-last')).toHaveText(`\u{1F525} Hot topic: ${topic}`)
  await expect(page.locator('.cht-row[data-thread="quad"] .cht-kind')).toHaveCount(0)
  await expect(page.locator(`.cht-row[data-thread="${group}"] .cht-kind`)).toHaveText('Group')
  await expect(page.locator('.cht-row[data-thread="i:music"] .cht-kind')).toHaveText('Interest group')
  await expect(page.locator(`.cht-row[data-thread="${dm}"] .cht-kind`)).toHaveCount(0)
  await expect(page.locator(`.cht-row[data-thread="${dm}"] b`)).toHaveText('Bonga Dube')
  await expect(page.locator(`.cht-row[data-thread="${dm}"] .cht-last`)).toHaveText('Howzit! You coming to the Quad later?')
  expect((await style(page.locator(`.cht-row[data-thread="${dm}"]`), ['backgroundColor'])).backgroundColor).toBe(WHITE)
  const badge = await style(page.locator(`.cht-row[data-thread="${dm}"] .cht-badge`), ['backgroundColor', 'color'])
  expect(badge).toMatchObject({ backgroundColor: YELLOW, color: INK })
  expect(await paletteFaults(page, '.cht-sheet'), 'the chat list').toEqual([])
  await shot(page, 'list-390')

  // ---- V3 a DM ----
  await page.locator(`.cht-row[data-thread="${dm}"]`).tap()
  await expect(page.locator('.cht-lines li.them .cht-text')).toHaveText('Howzit! You coming to the Quad later?')
  await page.locator('.cht-form input').fill('On my way now')
  await page.locator('.cht-form button[type="submit"]').tap()
  await expect(page.locator('.cht-lines li.me .cht-text')).toHaveText('On my way now')
  // the header: back arrow, avatar, name, "online" (friends both ways, and he synced a moment ago)
  await expect(page.locator('.cht-head .cht-back')).toBeVisible()
  await expect(page.locator('.cht-head .cht-av')).toBeVisible()
  await expect(page.locator('.cht-title b')).toHaveText('Bonga Dube')
  await expect(page.locator('.cht-title small')).toHaveText('online')
  // the wall: light blue with our doodles; bubbles white and pale green, ink text, the time inside the bubble
  const wall = await style(page.locator('.cht-lines'), ['backgroundColor', 'backgroundImage'])
  expect(wall.backgroundColor).toBe('rgb(220, 235, 245)')
  expect(wall.backgroundImage).toContain('data:image/svg+xml')
  const them = await style(page.locator('.cht-lines li.them .cht-bub'), ['backgroundColor', 'color'])
  const mineBub = await style(page.locator('.cht-lines li.me .cht-bub'), ['backgroundColor', 'color'])
  expect(them).toMatchObject({ backgroundColor: WHITE, color: INK })
  expect(mineBub).toMatchObject({ backgroundColor: 'rgb(217, 242, 199)', color: INK })
  await expect(page.locator('.cht-lines li.them .cht-bub .cht-time')).toHaveText(/^\d\d:\d\d$/)
  await expect(page.locator('.cht-lines li.me .cht-bub .cht-time')).toHaveText(/^\d\d:\d\d$/)
  // (a tail on the first bubble of a run)
  expect(await page.locator('.cht-lines li.them.lead .cht-bub').first().evaluate((el) => getComputedStyle(el, '::before').borderTopWidth)).toBe('9px')
  // the input: a rounded white bar and a round yellow button
  const bar = await style(page.locator('.cht-bar'), ['backgroundColor', 'borderTopLeftRadius'])
  expect(bar.backgroundColor).toBe(WHITE)
  expect(parseFloat(bar.borderTopLeftRadius)).toBeGreaterThanOrEqual(20)
  const send = await style(page.locator('.cht-form .cht-send'), ['backgroundColor', 'color', 'borderTopLeftRadius'])
  expect(send).toMatchObject({ backgroundColor: YELLOW, color: INK, w: 44, h: 44 })
  expect(send.borderTopLeftRadius).toBe('50%')
  await expect(page.locator('.cht-form .cht-send')).toHaveAttribute('aria-label', 'Send')
  expect(await paletteFaults(page, '.cht-sheet'), 'a DM').toEqual([])
  // typing: he types, I see it, and it goes by itself; I type, one signal at most every 3 s
  await expect(page.locator('.cht-typing')).toBeHidden()
  await page.evaluate(([t, f]) => window.mzansiNudge({ ty: t, f, n: 'Bonga' }), [dm, BONGA.p_id])
  await expect(page.locator('.cht-typing')).toHaveText('typing…')
  await shot(page, 'dm-390')
  await expect(page.locator('.cht-typing')).toBeHidden({ timeout: 8000 })
  const sent0 = (await chat(page)).typingSent
  await page.locator('.cht-form input').pressSequentially('Bring the ball', { delay: 40 })
  expect((await chat(page)).typingSent - sent0, 'fourteen keys in under a second: one signal').toBe(1)
  await page.waitForTimeout(3100)
  await page.locator('.cht-form input').pressSequentially(' please', { delay: 40 })
  expect((await chat(page)).typingSent - sent0, 'three seconds on: one more').toBe(2)
  await page.locator('.cht-form input').fill('')

  // ---- V4 the group ----
  await page.locator('.cht-back').tap()
  await page.locator(`.cht-row[data-thread="${group}"]`).tap()
  await expect(page.locator('.cht-lines li.them .cht-bub .cht-name')).toHaveText('Bonga Dube')
  await expect(page.locator('.cht-title small')).toContainText('2 members')
  await page.locator('.cht-form input').fill('Legend. Library at four?')
  await page.locator('.cht-form button[type="submit"]').tap()
  await expect(page.locator('.cht-lines li.me .cht-text')).toHaveText('Legend. Library at four?')
  await page.evaluate(([t, f]) => window.mzansiNudge({ ty: t, f, n: 'Bonga' }), [group, BONGA.p_id])
  await expect(page.locator('.cht-typing')).toHaveText('Bonga is typing…')
  expect(await paletteFaults(page, '.cht-sheet'), 'a group').toEqual([])
  await shot(page, 'group-390')
  // (never from somebody you blocked, and never in the Quad)
  await page.locator('.cht-back').tap()
  await page.locator('.cht-row[data-thread="quad"]').tap()
  const sentQ = (await chat(page)).typingSent
  await page.locator('.cht-form input').pressSequentially('Fair', { delay: 40 })
  expect((await chat(page)).typingSent, 'no typing signal in the Quad').toBe(sentQ)
  await page.evaluate((f) => window.mzansiNudge({ ty: 'quad', f, n: 'Bonga' }), BONGA.p_id)
  await page.waitForTimeout(300)
  await expect(page.locator('.cht-typing')).toBeHidden()
  expect(await paletteFaults(page, '.cht-sheet'), 'the Quad').toEqual([])
  expect(errors).toEqual([])
})

test('V5 a new message: a white banner under the top bar for 5 s, one buzz, and a bigger count that pulses until the chat is opened', async ({ browser }) => {
  // (this one runs with motion allowed: the pulse is switched off under reduced motion, which is checked at the end)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.addInitScript(() => { window.__buzz = []; try { Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms) => { window.__buzz.push(ms); return true } }) } catch { /* not allowed */ } })
  const { errors, dm } = await setUp(page, 'Zinhle')
  const anim = () => page.locator('.tb-chat .cht-unread').evaluate((el) => getComputedStyle(el).animationName)
  await expect(page.locator('.tb-chat .cht-unread')).toBeHidden()

  await bongaSays(dm, 'Lunch at the Caf? My treat')
  await syncNow(page)
  const ping = page.locator('.cht-ping')
  await expect(ping).toBeVisible({ timeout: 40000 })
  const shownAt = Date.now()
  await expect(ping.locator('b')).toHaveText('Bonga Dube')
  await expect(ping).toContainText('Lunch at the Caf? My treat')
  await expect(ping.locator('.cht-av')).toBeVisible()
  const barBottom = await page.locator('#app .g-hud.tb').evaluate((el) => Math.round(el.getBoundingClientRect().bottom))
  const b = await style(ping, ['backgroundColor', 'color', 'boxShadow'])
  expect(b.backgroundColor).toBe(WHITE)
  expect(b.color).toBe(INK)
  expect(b.boxShadow).not.toBe('none')
  expect(b, 'edge to edge').toMatchObject({ x: 0, w: 390 })
  expect(Math.abs(b.y - barBottom), 'just under the top bar').toBeLessThanOrEqual(2)
  expect(await paletteFaults(page, '.cht-ping'), 'the banner').toEqual([])
  expect(await page.evaluate(() => window.__buzz), 'one buzz').toEqual([60])
  await page.screenshot({ path: `${OUT}/banner-390.png` })
  // the count: bigger, and pulsing while the chat is shut
  const count = await style(page.locator('.tb-chat .cht-unread'), ['backgroundColor', 'color'])
  expect(count.h).toBeGreaterThanOrEqual(22)
  await expect(page.locator('.tb-chat .cht-unread')).toHaveText('1')
  expect(await anim()).toBe('cht-pulse')
  // five seconds, then it goes by itself
  await page.waitForTimeout(Math.max(0, 4300 - (Date.now() - shownAt)))
  await expect(ping).toBeVisible()
  await expect(ping).toBeHidden({ timeout: 4000 })
  expect(await anim(), 'still pulsing: the chat has not been opened').toBe('cht-pulse')
  // the next one: a tap opens the thread, and the pulse stops
  await bongaSays(dm, 'Table by the window')
  await syncNow(page)
  await expect(ping).toBeVisible({ timeout: 40000 })
  await ping.tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  await expect(page.locator('.cht-lines li.them .cht-text')).toHaveText(['Lunch at the Caf? My treat', 'Table by the window'])
  await expect(page.locator('.tb-chat .cht-unread')).toBeHidden()
  expect(await page.evaluate(() => window.__buzz.length), 'one buzz per banner').toBe(2)
  // reduced motion: the count is there, without the pulse
  await page.locator('.cht-x').first().tap()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await bongaSays(dm, 'You there?')
  await syncNow(page)
  await expect(page.locator('.tb-chat .cht-unread')).toHaveText('1', { timeout: 40000 })
  expect(await anim()).toBe('none')
  expect(errors).toEqual([])
  await context.close()
})
