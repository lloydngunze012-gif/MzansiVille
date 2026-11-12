// Social C (owner, 11 Nov) on three phones. Each phone is its own browser context (its own identity); presence
// travels over the real Supabase Realtime on a test room of its own; the chat's server is supabase/chat.sql on a
// real Postgres in this process (tests/chat-server.js).
//   1 Find me: Bonga says Yes on the card. Ayanda, his friend both ways, gets "Bonga is on campus. Go to him /
//     Say hi"; Chloe, who only has him on her own list, gets nothing and is told nothing about where he is.
//   2 Go to: Bonga walks off; Ayanda taps "Go to him" and walks to where he really is now (his live position, not
//     an old spot), stopping about 2 m short.
//   3 Open groups: Ayanda's group is Open about Studying. Chloe, who picked Studying, is offered it once and joins;
//     Bonga, who did not, is offered nothing. All three phones agree on who is in it.
// Screenshots at 390 px (not committed): docs/sprints/social-c/.
// Run: npx playwright test tests/presence/social-c.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/social-c'
const ROOM = `test-socialc-${Date.now().toString(36)}`
test.setTimeout(480000)
test.use({ actionTimeout: 20000 })

let server
const Q = `&chat=1&findwait=1&room=${ROOM}`
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const find = (page) => page.evaluate(() => window.mzansiFind.state())
const pos = (page) => page.evaluate(() => window.mzansiPlayerPos())
const syncNow = (page) => page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
const card = (page, kind) => page.locator(`.fm-card[data-fm="${kind}"]`)
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }) }
async function phone(browser, name, preset) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  await server.routeChat(ctx)
  const page = await ctx.newPage()
  await atGate(page, { query: Q, name, preset })
  await expect.poll(async () => (await chat(page)).socialC, { timeout: 30000 }).toBe(true)
  const me = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
  return { ctx, page, name, me, id: me.p_id }
}

test('find me for friends both ways only; Go to walks to where they are; an open group is offered to the one who picked its interest', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  const a = await phone(browser, 'Ayanda', 'q-naledi')
  const b = await phone(browser, 'Bonga', 'q-thabo')
  const c = await phone(browser, 'Chloe', 'q-emma')
  // Ayanda and Bonga are friends both ways; Chloe has Bonga on her list, he has not added her back
  await server.call('chat_friend', { ...a.me, p_other: b.id })
  await server.call('chat_friend', { ...b.me, p_other: a.id })
  await server.call('chat_friend', { ...c.me, p_other: b.id })
  for (const p of [a, b, c]) await expect.poll(async () => (await p.page.evaluate(() => window.mzansiOthers())).length, { timeout: 40000 }).toBe(2)

  // ---------- 1 find me ----------
  // everyone is asked; Ayanda and Chloe say Not now, Bonga says Yes
  for (const p of [a, c]) await card(p.page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  await expect(card(b.page, 'ask')).toBeVisible({ timeout: 40000 })
  await shot(b.page, 'three-find-card')
  await card(b.page, 'ask').locator('[data-fm-act="yes"]').tap()
  await expect.poll(async () => (await server.rows('select spot from chat_players where id = $1', [b.id]))[0].spot?.part, { timeout: 30000 }).toBe('campus')
  for (const p of [a, c]) await syncNow(p.page)
  // Ayanda is told, with his name and where; Chloe is not, and her phone holds nothing about where he is
  await expect(card(a.page, 'here')).toBeVisible({ timeout: 30000 })
  await expect(card(a.page, 'here')).toContainText('Bonga is on campus.')
  await expect(card(a.page, 'here').locator('[data-fm-act="go"]')).toHaveText('Go to him')
  await shot(a.page, 'three-friend-here')
  await c.page.waitForTimeout(5000)
  await expect(card(c.page, 'here')).toHaveCount(0)
  expect((await chat(c.page)).sharing).toEqual([])
  expect((await chat(c.page)).friends.find((f) => f.id === b.id), 'a one-way friend: no online, no spot').toEqual({ id: b.id, name: 'Bonga', mutual: false })
  expect((await chat(a.page)).sharing.map((f) => f.id)).toEqual([b.id])

  // ---------- 2 Go to ----------
  // Bonga walks off to open ground some way away
  const far = await b.page.evaluate(() => {
    const p = window.mzansiPlayerPos()
    for (const [dx, dz] of [[-9, -12], [9, -12], [0, -16], [-13, -5], [13, -5]]) if (window.mzansiOpen(p.x + dx, p.z + dz)) return { x: p.x + dx, z: p.z + dz }
    return null
  })
  expect(far).toBeTruthy()
  await b.page.evaluate(([x, z]) => window.mzansiWalkTo(x, z), [far.x, far.z])
  await expect.poll(async () => { const p = await pos(b.page); return Math.hypot(p.x - far.x, p.z - far.z) }, { timeout: 60000 }).toBeLessThan(1.5)
  const bAt = await pos(b.page)
  const before = await pos(a.page)
  expect(Math.hypot(before.x - bAt.x, before.z - bAt.z), 'they are well apart to start with').toBeGreaterThan(8)
  await card(a.page, 'here').locator('[data-fm-act="go"]').tap()
  await expect.poll(async () => (await find(a.page)).going, { timeout: 5000 }).toBe(b.id)
  await expect.poll(async () => (await find(a.page)).going, { timeout: 120000 }).toBe('')
  const end = await pos(a.page)
  const gap = Math.hypot(end.x - bAt.x, end.z - bAt.z)
  expect(gap, 'beside him, not on him').toBeGreaterThan(1.2)
  expect(gap, 'where he is now, not where he was when he said yes').toBeLessThan(3.4)
  expect(await a.page.evaluate(() => window.mzansiToasts.some((t) => t.includes('You found Bonga')))).toBe(true)
  await shot(a.page, 'three-found')
  // the Friends tab has Go to beside him on Ayanda's phone, and not on Chloe's
  await a.page.locator('.tb-chat').tap()
  await a.page.locator('.cht-tabs [data-tab="friends"]').tap()
  await expect(a.page.locator(`.cht-friend[data-friend="${b.id}"] [data-goto]`)).toBeVisible()
  await a.page.locator('.cht-x').first().tap()
  await c.page.locator('.tb-chat').tap()
  await c.page.locator('.cht-tabs [data-tab="friends"]').tap()
  await expect(c.page.locator(`.cht-friend[data-friend="${b.id}"]`)).toBeVisible({ timeout: 40000 })
  await expect(c.page.locator(`.cht-friend[data-friend="${b.id}"] [data-goto]`)).toHaveCount(0)
  await c.page.locator('.cht-x').first().tap()

  // ---------- 3 an open group ----------
  await a.page.locator('.tb-chat').tap()
  await a.page.locator('.cht-tabs [data-tab="chats"]').tap()
  await a.page.locator('[data-ct="new"]').tap()
  await a.page.locator('.cht-new input').fill('Library Crew')
  await a.page.locator('.cht-new button[type="submit"]').tap()
  await expect(a.page.locator('.cht-info')).toBeVisible()
  await a.page.locator('.cht-rowbtns [data-ct="info"]').tap()
  await a.page.locator('.cht-openrow [data-ct="open"]').tap()
  await a.page.locator('.cht-tags [data-tag="studying"]').tap()
  await expect(a.page.locator('.cht-openrow')).toHaveAttribute('data-listed', '1', { timeout: 15000 })
  const g = (await chat(a.page)).threads.find((t) => t.name === 'Library Crew')
  await a.page.locator('.cht-x').first().tap()
  // Chloe picked Studying, Bonga picked Gym
  await server.call('chat_interests', { ...c.me, p_list: ['studying'] })
  await server.call('chat_interests', { ...b.me, p_list: ['gym'] })
  // their next visit: Chloe is offered it once; Bonga is offered nothing
  for (const p of [b, c]) { await p.page.reload(); await expect(p.page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 }) }
  await card(c.page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  await expect(card(c.page, 'group')).toBeVisible({ timeout: 40000 })
  await expect(card(c.page, 'group')).toContainText('Library Crew (1 member) is talking Studying.')
  await shot(c.page, 'three-group-suggested')
  await card(c.page, 'group').locator('[data-fm-act="join"]').tap()
  await expect(c.page.locator('.cht-sheet')).toHaveAttribute('data-view', 'thread', { timeout: 20000 })
  await expect(c.page.locator('.cht-title b')).toContainText('Library Crew')
  await b.page.waitForTimeout(8000)
  await expect(card(b.page, 'group')).toHaveCount(0)
  expect((await server.rows('select suggest_day from chat_players where id = $1', [b.id]))[0].suggest_day, 'nothing was offered to Bonga, so his day is not used up').toBe(null)
  // all three agree: two members, Ayanda and Chloe
  expect((await server.rows('select player from chat_members where thread = $1 order by player', [g.id])).map((r) => r.player).sort()).toEqual([a.id, c.id].sort())
  await syncNow(a.page)
  await expect.poll(async () => (await chat(a.page)).threads.find((t) => t.id === g.id)?.members, { timeout: 30000 }).toBe(2)
  expect((await chat(b.page)).threads.some((t) => t.id === g.id)).toBe(false)
  for (const p of [a, b, c]) await p.ctx.close()
})
