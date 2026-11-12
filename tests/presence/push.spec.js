// Notifications (owner, 11 Nov): a REAL push between two browsers. The game's own code on both phones, the real
// chat rules (supabase/chat.sql on PGlite, tests/chat-server.js), the real server code (api/_push.js) and real push
// services: Google's (Chrome, the one Android Chrome uses) and Microsoft's (Edge). Only the HTTP hop to /api/push
// is answered in the test instead of on Vercel, with a VAPID key pair made for this run.
//   P1 Thabo (Chrome, Android phone size) turns pings on from the menu; he leaves the game; Ayanda (Edge) messages
//      him; his phone shows "Ayanda: <first line>"; a second line within 10 minutes does not push again; "hide
//      message text" sends no words; a muted group never pushes and neither does a blocked player.
// Run: npx playwright test tests/presence/push.spec.js --config playwright.gpu.config.js --workers=1
// (Push needs a browser profile of its own: an incognito context cannot subscribe, so each phone is a persistent context.)
import { test, expect, chromium } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import webpush from 'web-push'
import { chatServer } from '../chat-server.js'
import { pushForLine } from '../../api/_push.js'
import { atGate } from '../city.js'

const OUT = 'docs/sprints/notify'
const BASE = 'http://localhost:5173'
const ROOM = `test-push-${Date.now().toString(36)}`
const KEYS = webpush.generateVAPIDKeys()
webpush.setVapidDetails('https://softlifeza.vercel.app', KEYS.publicKey, KEYS.privateKey)
test.setTimeout(420000)

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const shown = (page) => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })))

test('P1 a real push: on from the menu, away, a DM arrives as a notification; the 10-minute fold, hide text, mute and block', async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const server = await chatServer()
  const sent = []
  const deps = {
    rpc: async (fn, args) => (await server.call(fn, args)).body,
    send: async (sub, payload) => { const r = await webpush.sendNotification(sub, payload, { TTL: 600 }); sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), status: r.statusCode }); return r },
  }
  const phone = async (channel, ua) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `push-${channel}-`))
    const ctx = await chromium.launchPersistentContext(dir, { channel, headless: true, baseURL: BASE, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: channel === 'chrome', userAgent: ua, reducedMotion: 'reduce', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
    await ctx.grantPermissions(['notifications'], { origin: BASE })
    await server.routeChat(ctx)
    await ctx.route('**/api/push', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: KEYS.publicKey }) })
      const out = await pushForLine(JSON.parse(route.request().postData() || '{}'), deps)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) })
    })
    const page = ctx.pages()[0] || (await ctx.newPage())
    return { ctx, page, dir }
  }
  const T = await phone('chrome', ANDROID)
  const A = await phone('msedge', undefined)
  const Q = (n) => `&chat=1&push=1&room=${ROOM}-${n}`
  const errT = await atGate(T.page, { query: Q('t'), name: 'Thabo', preset: 'q-thabo' })
  const errA = await atGate(A.page, { query: Q('a'), name: 'Ayanda', preset: 'q-emma' })
  for (const p of [T.page, A.page]) await expect.poll(async () => (await p.evaluate(() => window.mzansiThreads())).status, { timeout: 30000 }).toBe('ready')
  const thabo = await me(T.page)
  const ayanda = await me(A.page)

  // Thabo turns pings on from the menu: the browser's real subscription reaches the server
  await T.page.locator('.tb-menu').tap()
  await T.page.locator('.g-menu [data-act="notify-open"]').tap()
  await T.page.locator('.sl-pop [data-ntp="on"]').tap()
  await expect(T.page.locator('.sl-pop [data-ntp="on"]')).toHaveAttribute('aria-pressed', 'true', { timeout: 90000 }) // (Chrome's first registration with Google's push service takes 25-35 s)
  const subs = await server.rows('select endpoint from chat_push_subs where player = $1', [thabo.p_id])
  expect(subs).toHaveLength(1)
  expect(subs[0].endpoint).toMatch(/^https:\/\/fcm\.googleapis\.com\//)
  await T.page.locator('.sl-pop [data-ntp="close"]').tap()
  // ...and leaves the game (his phone's service worker stays; the server last saw him over a minute ago)
  await T.page.goto(`${BASE}/offline.html`)
  await server.db.query("update chat_players set seen_at = now() - interval '5 minutes', push_quiet = false where id = $1", [thabo.p_id])

  // (job I: a chat is a request; friends both ways skip it)
  await server.call('chat_friend', { ...ayanda, p_other: thabo.p_id, p_on: true }); await server.call('chat_friend', { ...thabo, p_other: ayanda.p_id, p_on: true })
  // Ayanda messages him from her phone
  const dm = await A.page.evaluate((id) => import('/src/threads.js').then((m) => m.dmWith(id, { name: 'Thabo' })), thabo.p_id)
  expect(dm.ok).toBe(true)
  await A.page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Howzit Thabo, library at 3?')), dm.thread)
  await expect.poll(() => sent.length, { timeout: 20000 }).toBe(1)
  expect(sent[0].status).toBe(201)
  await expect.poll(async () => (await shown(T.page)).length, { timeout: 30000 }).toBe(1)
  const n1 = (await shown(T.page))[0]
  expect(n1).toEqual({ title: 'Soft Life', body: 'Ayanda: Howzit Thabo, library at 3?', tag: dm.thread, url: `/?thread=${encodeURIComponent(dm.thread)}#/play` })
  fs.writeFileSync(`${OUT}/push-received.json`, JSON.stringify({ browser: 'Chrome (Android UA), push via fcm.googleapis.com', notification: n1 }, null, 2))

  // a second line within 10 minutes: no second push (it folds into the next one)
  await server.db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [ayanda.p_id])
  await A.page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Or 4?')), dm.thread)
  await A.page.waitForTimeout(3000)
  expect(sent.length, 'one push per thread per 10 minutes').toBe(1)

  // hide message text: the next push (after 10 minutes) has no words from the message
  await server.call('chat_push_prefs', { ...thabo, p_hide: true })
  await server.db.query("update chat_members set pushed_at = now() - interval '11 minutes' where player = $1", [thabo.p_id])
  await server.db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [ayanda.p_id])
  await A.page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Secret plans')), dm.thread)
  await expect.poll(() => sent.length, { timeout: 20000 }).toBe(2)
  expect(sent[1].payload.body).toBe('Ayanda sent you a message')
  await expect.poll(async () => (await shown(T.page))[0]?.body, { timeout: 30000 }).toBe('Ayanda sent you a message')
  expect((await shown(T.page)).length, 'the same thread replaces its notification').toBe(1)

  // a group he muted never pushes
  const g = (await server.call('chat_group_create', { ...ayanda, p_name: 'Study Crew' })).body.thread
  await server.db.query('insert into chat_members (thread, player) values ($1, $2)', [g, thabo.p_id])
  await server.call('chat_mute', { ...thabo, p_thread: g, p_on: true })
  await A.page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
  await server.db.query("update chat_lines set at = now() - interval '3 seconds' where sender = $1", [ayanda.p_id])
  await A.page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Group hello')), g)
  await A.page.waitForTimeout(3000)
  expect(sent.length, 'muted: no push').toBe(2)
  // ...and nothing from a player he blocked
  await server.call('chat_mute', { ...thabo, p_thread: g, p_on: false })
  await server.call('chat_block', { ...thabo, p_other: ayanda.p_id, p_on: true })
  await server.db.exec("update chat_members set pushed_at = null; update chat_lines set at = now() - interval '3 seconds'")
  await A.page.evaluate((t) => import('/src/threads.js').then((m) => m.sendLine(t, 'Still there?')), g)
  await A.page.waitForTimeout(3000)
  expect(sent.length, 'blocked: no push').toBe(2)

  expect(errT).toEqual([])
  expect(errA).toEqual([])
  await T.ctx.close()
  await A.ctx.close()
})
