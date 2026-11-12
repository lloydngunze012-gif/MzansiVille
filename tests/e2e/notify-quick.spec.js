// Notifications (owner, 11 Nov), one phone, in the quick project. The server is supabase/chat.sql on a real Postgres
// in this process (tests/chat-server.js); "Bonga" is played straight on that server.
//   N1 Asking at a good moment: nothing on load; the first DM reply brings our own card first ("Get a ping when
//      someone messages you?"); Not now asks nothing of the browser; the menu's Notifications card turns pings on
//      (the browser's question, a subscription the server keeps), and quiet hours, hide message text and the daily
//      area summary are saved on the server; a sent line asks the game's server to push the others.
//   N2 iPhone in Safari (not on the home screen): Yes shows the Add to Home Screen steps first.
//   N3 The town under the province on the opening page is saved; a newcomer from your town is welcomed with
//      "Emma from Durban just enrolled at UMzansi. Show her around." and Say hi opens a DM with her.
//   N4 A tapped notification's link (/?thread=<id>) opens the game straight into that thread.
// The browser's own push service is stubbed here (no real push leaves this machine); the real end-to-end push
// between two browsers is tests/presence/push.spec.js. Screenshots at 390 px (not committed): docs/sprints/notify/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/notify'
const ROOM = `test-notify-${Date.now().toString(36)}`
const BONGA = { p_id: 'bonga-push-player-0001', p_secret: 'bonga-secret-0123456789abcdef' }
// (a made-up public key in the right shape: the stubbed push service never checks it)
const VAPID = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
test.setTimeout(300000)
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })

let server
test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  await server.call('chat_sync', { ...BONGA, p_name: 'Bonga Dube', p_handle: 'bonga_d', p_house: 'Peak', p_look: { gender: 'male' } })
})
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const syncNow = (page) => page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
const notify = (page) => page.evaluate(() => window.mzansiNotify())
// (a screenshot is evidence, not a check: under the gate's two browsers the page can stall for many seconds, so it gets 60 s)
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 }) }
const Q = (name) => `&chat=1&push=1&vapid=${VAPID}&room=${ROOM}-${name}`

// The browser's push service, stubbed: permission is asked and granted, a subscription comes back.
async function stubPush(page, { answer = 'granted' } = {}) {
  await page.addInitScript((answer) => {
    let perm = 'default'
    window.__asked = 0
    Object.defineProperty(Notification, 'permission', { get: () => perm, configurable: true })
    Notification.requestPermission = async () => { window.__asked += 1; perm = answer; return perm }
    const sub = { endpoint: 'https://push.example.test/sub/ayanda-1', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } } }, async unsubscribe() { window.__unsub = true; return true } }
    let has = null
    PushManager.prototype.subscribe = async function (opts) { window.__subOpts = { visible: opts.userVisibleOnly, keyBytes: opts.applicationServerKey?.byteLength }; has = sub; return sub }
    PushManager.prototype.getSubscription = async function () { return has }
  }, answer)
}

test('N1 asked at a good moment, Not now, then on from the menu; the server keeps the subscription and the choices; a send asks for a push', async ({ page }) => {
  await server.routeChat(page)
  await stubPush(page)
  const posts = []
  await page.route('**/api/push', (route) => { posts.push(JSON.parse(route.request().postData() || '{}')); return route.fulfill({ status: 200, contentType: 'application/json', body: '{"sent":0}' }) })
  const errors = await atGate(page, { query: Q('a'), name: 'Ayanda' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await me(page)
  // nothing on load: no card, the browser never asked
  await page.waitForTimeout(3000)
  await expect(page.locator('.fm-card[data-fm="push"]')).toHaveCount(0)
  expect(await page.evaluate(() => window.__asked)).toBe(0)
  // Bonga messages: the first reply in a DM is the moment, and it is our card first
  const dm = (await server.call('chat_dm', { ...BONGA, p_other: mine.p_id })).body.thread
  await server.call('chat_send', { ...BONGA, p_thread: dm, p_body: 'Howzit! You at the Caf later?' })
  await syncNow(page)
  const card = page.locator('.fm-card[data-fm="push"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card).toContainText('Get a ping when someone messages you?')
  await shot(page, 'permission-card-390')
  expect(await page.evaluate(() => window.__asked), 'the browser is not asked before Yes').toBe(0)
  await card.locator('[data-nt="no"]').tap()
  await expect(card).toHaveCount(0)
  expect(await page.evaluate(() => window.__asked)).toBe(0)
  expect((await notify(page)).store.asks).toBe(1)
  // the menu: Notifications: Off -> its card -> Pings for messages
  await page.locator('.tb-menu').tap()
  const item = page.locator('.g-menu [data-act="notify-open"]')
  await expect(item).toContainText('Off')
  await item.tap()
  const pop = page.locator('.sl-pop[data-kind="notify"]')
  await expect(pop).toBeVisible()
  await pop.locator('[data-ntp="on"]').tap()
  await expect(pop.locator('[data-ntp="on"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  expect(await page.evaluate(() => window.__asked)).toBe(1)
  expect(await page.evaluate(() => window.__subOpts)).toEqual({ visible: true, keyBytes: 65 })
  const subs = await server.rows('select player, endpoint from chat_push_subs')
  expect(subs).toEqual([{ player: mine.p_id, endpoint: 'https://push.example.test/sub/ayanda-1' }])
  // the choices: quiet hours on by default; hide message text and the area summary saved on the server
  await expect(pop.locator('[data-ntp="quiet"]')).toHaveAttribute('aria-pressed', 'true')
  await pop.locator('[data-ntp="hide"]').tap()
  await expect(pop.locator('[data-ntp="hide"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
  await pop.locator('[data-ntp="area"]').tap()
  await expect(pop.locator('[data-ntp="area"]')).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 })
  expect((await server.rows('select push_quiet, push_hide, push_area from chat_players where id = $1', [mine.p_id]))[0]).toEqual({ push_quiet: true, push_hide: true, push_area: false })
  await shot(page, 'menu-card-390')
  await pop.locator('[data-ntp="close"]').tap()
  // a reply from this phone asks the game's server to push the others, with who sent it and where
  await page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Ja, 1 pm!')), dm)
  await expect.poll(() => posts.length, { timeout: 10000 }).toBeGreaterThan(0)
  expect(posts[0]).toEqual({ id: mine.p_id, secret: mine.p_secret, thread: dm })
  // ...and the server would push Bonga if he were away with a phone subscribed (the rules are in sql-check)
  await server.call('chat_push_sub', { ...BONGA, p_endpoint: 'https://push.example.test/sub/bonga', p_p256dh: 'B'.repeat(87), p_auth: 'A'.repeat(22) })
  await server.db.query("update chat_players set seen_at = now() - interval '5 minutes', push_quiet = false where id = $1", [BONGA.p_id])
  const due = (await server.call('chat_push_due', { ...mine, p_thread: dm })).body
  expect(due.pushes.map((p) => [p.player, p.kind, p.from, p.first])).toEqual([[BONGA.p_id, 'dm', 'Ayanda', 'Ja, 1 pm!']])
  // off again from the menu: the server forgets this phone
  await page.locator('.tb-menu').tap()
  await page.locator('.g-menu [data-act="notify-open"]').tap()
  await pop.locator('[data-ntp="on"]').tap()
  await expect(pop.locator('[data-ntp="on"]')).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 })
  expect(await server.rows('select endpoint from chat_push_subs where player = $1', [mine.p_id])).toEqual([])
  expect(errors).toEqual([])
})

test('N2 an iPhone in Safari: Yes shows the Add to Home Screen steps first', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' })
  const page = await context.newPage()
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('b'), name: 'Lindo' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await me(page)
  expect((await notify(page)).state).toBe('ios')
  const dm = (await server.call('chat_dm', { ...BONGA, p_other: mine.p_id })).body.thread
  await server.call('chat_send', { ...BONGA, p_thread: dm, p_body: 'Sharp sharp' })
  await syncNow(page)
  const card = page.locator('.fm-card[data-fm="push"]')
  await expect(card).toBeVisible({ timeout: 20000 })
  await card.locator('[data-nt="yes"]').tap()
  const steps = page.locator('.fm-card[data-fm="push-ios"]')
  await expect(steps).toBeVisible()
  await expect(steps).toContainText('Add to Home Screen')
  await expect(steps.locator('.nt-steps li')).toHaveCount(3)
  await shot(page, 'iphone-steps-390')
  await steps.locator('[data-nt="ok"]').tap()
  await expect(steps).toHaveCount(0)
  // the menu says the same, and never asks the browser
  await page.locator('.tb-menu').tap()
  await page.locator('.g-menu [data-act="notify-open"]').tap()
  await expect(page.locator('.sl-pop[data-kind="notify"] .nt-note')).toContainText('home screen')
  expect(errors).toEqual([])
  await context.close()
})

test('N3 the town on the opening page is saved; a newcomer from your town is welcomed, and Say hi opens a DM', async ({ page }) => {
  await server.routeChat(page)
  // the opening page: KwaZulu-Natal's towns are in the same dropdown as the provinces
  await page.goto('/?fast=1&enrol=quick#/new')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload()
  const pick = page.locator('.qs-panel select[data-province]')
  await expect(pick.locator('optgroup[label="KwaZulu-Natal"] option', { hasText: 'Durban' })).toHaveCount(1)
  await pick.selectOption('KwaZulu-Natal|Durban')
  await expect(page.locator('.qs-panel [data-province-pick] span')).toHaveText('Durban')
  await shot(page, 'town-pick-390')
  await page.locator('#name').fill('Sizwe')
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 }) // (day 1 starts at home)
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character)
  expect([c.from, c.town]).toEqual(['KwaZulu-Natal', 'Durban'])

  // the welcome: Ayanda (from Durban) is online; Emma from Durban finishes the quick start
  const errors = await atGate(page, { query: Q('c'), name: 'Ayanda' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await me(page)
  await server.call('chat_town', { ...mine, p_town: 'Durban' })
  const EMMA = { p_id: 'emma-new-player-0001', p_secret: 'emma-secret-0123456789abcdef' }
  await server.call('chat_sync', { ...EMMA, p_name: 'Emma Botha', p_look: { gender: 'female' } })
  expect((await server.call('chat_joined', { ...EMMA, p_area: 'Durban' })).body.ok).toBe(true)
  await syncNow(page)
  const toast = page.locator('.jt-toast[data-kind="welcome"]')
  await expect(toast).toBeVisible({ timeout: 15000 })
  await expect(toast).toContainText('Emma from Durban just enrolled at UMzansi. Show her around.')
  await shot(page, 'welcome-toast-390')
  await toast.locator('[data-jt="hi"]').tap()
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).open, { timeout: 15000 }).toMatch(/^dm:/)
  // told once
  await syncNow(page)
  await page.waitForTimeout(1000)
  await expect(page.locator('.jt-toast[data-kind="welcome"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('N4 a tapped notification opens the game straight into its thread', async ({ page }) => {
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('d'), name: 'Thando' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const mine = await me(page)
  const dm = (await server.call('chat_dm', { ...BONGA, p_other: mine.p_id })).body.thread
  await server.call('chat_send', { ...BONGA, p_thread: dm, p_body: 'Tap me' })
  // what public/sw.js opens when the game is not running: /?thread=<id>#/play
  await page.goto(`/?fast=1&morning=0${Q('d')}&thread=${encodeURIComponent(dm)}#/play`)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiThreads())).open, { timeout: 40000 }).toBe(dm)
  await expect(page.locator('.cht-sheet')).toBeVisible()
  expect(await page.evaluate(() => location.search)).not.toContain('thread=')
  expect(errors).toEqual([])
})
