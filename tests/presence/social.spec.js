// Social A (owner, 11 Nov) on three phones. Each phone is its own browser context (its own identity); presence,
// the join toast and the chat's nudges travel over the real Supabase Realtime on a test room of its own; the
// chat's server is supabase/chat.sql on a real Postgres in this process (tests/chat-server.js).
//   1 Join toasts: when Bonga arrives, Ayanda sees "Bonga from South Africa just joined" with Say hi; a second
//     arrival inside the viewer's gap shows her nothing new; Say hi opens a DM with the newcomer.
//   2 A created group: Ayanda makes it and asks Bonga (not a friend both ways: he gets a card and taps Join) and
//     Chloe (No thanks: Ayanda sees "can't right now"); Chloe then joins through the invite link; all three talk
//     and see the same lines in the same order. The creator renames the group and removes Chloe, who cannot
//     rejoin by the link.
//   3 Walk together: Ayanda asks Bonga to walk to the Library from their DM; he accepts; she leads, he walks at her
//     side, the chat sheet stays open, and both end up at the Library.
// Screenshots at 390 px (not committed): docs/sprints/social-a/.
// Run: npx playwright test tests/presence/social.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/social-a'
const ROOM = `test-social-${Date.now().toString(36)}`
test.setTimeout(480000)
test.use({ actionTimeout: 20000 })

let server
const Q = `&chat=1&toast=1&room=${ROOM}`
async function phone(browser, name, preset) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  await server.routeChat(ctx)
  const page = await ctx.newPage()
  await atGate(page, { query: Q, name, preset })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.presence')).id)
  // (a newcomer tells the room once it is in it: wait for that, so the next phone to arrive never hears this one's)
  await expect.poll(async () => (await server.rows('select joined_said from chat_players where id = $1', [id]))[0]?.joined_said, { timeout: 60000 }).toBe(true)
  await page.waitForTimeout(1000)
  return { ctx, page, name, id }
}
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const bodies = async (page) => (await chat(page)).lines.map((l) => l.body)
const sheet = (page) => page.locator('.cht-sheet')
const pos = (page) => page.evaluate(() => window.mzansiPlayerPos())
const shot = async (page, name) => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png` }) }
async function send(page, text) {
  await page.locator('.cht-form input').fill(text)
  await page.locator('.cht-form button[type="submit"]').tap()
}
async function openThread(page, id) {
  if (!(await sheet(page).isVisible())) await page.locator('.tb-chat').tap()
  if ((await chat(page)).open === id) return
  if ((await sheet(page).getAttribute('data-view')) === 'thread') await page.locator('.cht-back').first().tap()
  await page.locator(`.cht-row[data-thread="${id}"]`).tap()
  await expect.poll(async () => (await chat(page)).open).toBe(id)
}

test('join toasts with Say hi; three phones in a created group; walk together to the Library', async ({ browser }) => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()

  // ---------- 1 join toasts ----------
  const a = await phone(browser, 'Ayanda', 'q-naledi')
  await expect(a.page.locator('.jt-toast')).toHaveCount(0) // (nobody tells you about yourself)
  const b = await phone(browser, 'Bonga', 'q-thabo')
  const toastA = a.page.locator('.jt-toast')
  await expect(toastA).toBeVisible({ timeout: 40000 })
  await expect(toastA).toContainText('Bonga')
  await expect(toastA).toContainText('South Africa') // (no province picked: the country)
  await expect(toastA.locator('[data-jt="hi"]')).toHaveText('Say hi')
  expect((await toastA.boundingBox()).width).toBeLessThanOrEqual(420)
  await shot(a.page, 'join-toast-390')
  const shownAt = (await a.page.evaluate(() => window.mzansiJoinToast())).last
  // Bonga announced himself once; the server will not let him again
  expect((await server.rows('select joined_said from chat_players where id = $1', [b.id]))[0].joined_said).toBe(true)
  // a third arrives inside Ayanda's two minutes: nothing new for her; Bonga (his first) sees it and says hi
  const c = await phone(browser, 'Chloe', 'q-emma')
  const toastB = b.page.locator('.jt-toast')
  await expect(toastB).toBeVisible({ timeout: 40000 })
  await expect(toastB).toContainText('Chloe')
  expect((await a.page.evaluate(() => window.mzansiJoinToast())).last, 'at most one toast every 2 minutes per viewer').toBe(shownAt)
  await toastB.locator('[data-jt="hi"]').tap()
  await expect(sheet(b.page)).toHaveAttribute('data-view', 'thread')
  expect((await chat(b.page)).open).toMatch(/^dm:/)
  await expect(b.page.locator('.cht-title b')).toContainText('Chloe')
  await b.page.locator('.cht-x').first().tap()
  for (const p of [a, b, c]) await expect.poll(async () => (await p.page.evaluate(() => window.mzansiPresence())).count, { timeout: 40000 }).toBe(3)

  // ---------- 2 a created group, three phones ----------
  await a.page.locator('.tb-chat').tap()
  await a.page.locator('[data-ct="new"]').tap()
  await a.page.locator('.cht-new input').fill('Corridor DJs')
  await a.page.locator('.cht-new button[type="submit"]').tap()
  // "Add people": the people here now are in the list; Bonga is added
  await expect(a.page.locator(`.cht-info [data-add="${b.id}"]`)).toBeVisible()
  await a.page.locator(`.cht-info [data-add="${b.id}"]`).tap()
  // (follow-ups) they are not friends both ways: nobody lands in the group; Bonga gets a card to answer
  await expect(a.page.locator('.cht-note')).toHaveText('Asked. They get a card to join.')
  const group = (await chat(a.page)).threads.find((t) => t.name === 'Corridor DJs')
  const askB = b.page.locator('.cht-ask')
  await expect(askB).toBeVisible({ timeout: 40000 }) // (a nudge on his own channel, without doing anything)
  await expect(askB).toHaveText(/Ayanda wants to add you to Corridor DJs\./)
  expect((await askB.boundingBox()).width).toBeLessThanOrEqual(420)
  expect((await chat(b.page)).threads.some((t) => t.id === group.id), 'not in the group until he says so').toBe(false)
  await shot(b.page, 'ask-card-390')
  await askB.locator('[data-ask="join"]').tap()
  await expect.poll(async () => (await chat(b.page)).open, { timeout: 30000 }).toBe(group.id)
  await b.page.locator('.cht-x').first().tap()
  // the asker sees "added", nothing more
  await expect(a.page.locator('.g-toast', { hasText: 'Bonga was added to Corridor DJs.' })).toBeVisible({ timeout: 40000 })
  // Chloe is asked too and says No thanks: Ayanda sees "can't right now", nothing more
  await a.page.locator(`.cht-info [data-add="${c.id}"]`).tap()
  const askC = c.page.locator('.cht-ask')
  await expect(askC).toBeVisible({ timeout: 40000 })
  await askC.locator('[data-ask="no"]').tap()
  await expect(askC).toHaveCount(0)
  await expect(a.page.locator('.g-toast', { hasText: 'Chloe can’t right now.' })).toBeVisible({ timeout: 40000 })
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [group.id]))[0].n).toBe(2)
  // Chloe opens the invite link: she lands in the group
  await c.page.goto(`/?fast=1&morning=0&spawn=gate${Q}&g=${group.code}#/play`)
  await expect(sheet(c.page)).toHaveAttribute('data-view', 'thread', { timeout: 90000 })
  expect((await chat(c.page)).open).toBe(group.id)
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [group.id]))[0].n).toBe(3)
  // all three talk; everyone sees the same lines in the same order
  // (Ayanda is still on the group's "Add people" page: Done, then back to the thread)
  await a.page.locator('.cht-rowbtns [data-ct="info"]').tap()
  await a.page.locator('.cht-back[data-ct="thread"]').tap()
  await expect(a.page.locator('.cht-form input')).toBeVisible()
  await openThread(b.page, group.id)
  await send(a.page, 'Kick-off at five on the Quad')
  await expect.poll(() => bodies(c.page), { timeout: 30000 }).toContain('Kick-off at five on the Quad')
  await send(b.page, 'I am bringing the ball')
  await expect.poll(() => bodies(a.page), { timeout: 30000 }).toContain('I am bringing the ball')
  await send(c.page, 'Jackets for goalposts')
  const want = ['Kick-off at five on the Quad', 'I am bringing the ball', 'Jackets for goalposts']
  for (const p of [a, b, c]) await expect.poll(() => bodies(p.page), { timeout: 30000 }).toEqual(want)
  await expect(a.page.locator('.cht-title small')).toContainText('3 members')
  await shot(a.page, 'group-three-phones-a-390')
  await shot(c.page, 'group-three-phones-c-390')

  // ---------- 2b (follow-ups) the creator renames the group and removes a member ----------
  await a.page.locator('.cht-open[data-ct="info"]').tap()
  await a.page.locator('.cht-renameform input').fill('Quiet After Ten')
  await a.page.locator('.cht-renameform button[type="submit"]').tap()
  await expect(a.page.locator('.cht-note')).toHaveText('Renamed.')
  for (const p of [b, c]) await expect(p.page.locator('.cht-title b')).toContainText('Quiet After Ten', { timeout: 40000 })
  // Bonga is not the creator: his page of the group has no rename and no Remove
  await b.page.locator('.cht-open[data-ct="info"]').tap()
  await expect(b.page.locator('.cht-info .cht-friend')).toHaveCount(3)
  await expect(b.page.locator('.cht-renameform, [data-kick]')).toHaveCount(0)
  await b.page.locator('.cht-back[data-ct="thread"]').tap()
  // Ayanda removes Chloe: two taps; Chloe is out at once, and the link will not let her back in
  const kick = a.page.locator(`[data-kick="${c.id}"]`)
  await kick.tap()
  await expect(kick).toHaveText('Tap again')
  await shot(a.page, 'group-creator-page-390')
  await kick.tap()
  await expect(a.page.locator('.cht-note')).toContainText('Removed')
  await expect(a.page.locator('.cht-info .cht-friend')).toHaveCount(2)
  await expect(sheet(c.page)).toHaveAttribute('data-view', 'list', { timeout: 40000 })
  expect((await chat(c.page)).threads.some((t) => t.id === group.id)).toBe(false)
  // (her address still carries the group's code: opening the link again is a reload of the same page)
  await c.page.reload()
  await expect(c.page.locator('.cht-note')).toHaveText('You can’t join this group.', { timeout: 90000 })
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [group.id]))[0].n).toBe(2)
  await c.page.locator('.cht-x').first().tap()
  await a.page.locator('.cht-back[data-ct="thread"]').tap()

  // ---------- 3 walk together ----------
  // from their DM: Walk with me, where to, ask
  await a.page.locator('.cht-back').first().tap()
  await a.page.locator(`.cht-person[data-dm="${b.id}"]`).tap()
  await expect.poll(async () => (await chat(a.page)).open).toMatch(/^dm:/)
  await a.page.locator('[data-ct="walk"]').tap()
  const picker = a.page.locator('.wk-card')
  await expect(picker).toBeVisible()
  await picker.locator('.wk-dest', { hasText: 'Library' }).first().tap()
  await shot(a.page, 'walk-picker-390')
  const startA = await pos(a.page)
  const startB = await pos(b.page)
  await picker.locator('[data-wk="send"]').tap()
  // Bonga is asked, and accepts
  await b.page.locator('.cht-x').first().tap().catch(() => {})
  const ask = b.page.locator('.tg-invite')
  await expect(ask).toBeVisible({ timeout: 20000 })
  await expect(ask).toContainText('Ayanda wants to walk with you to Library')
  await ask.locator('[data-tg="accept"]').tap()
  // she leads, he walks at her side
  await expect.poll(async () => (await a.page.evaluate(() => window.mzansiWalk())).lead, { timeout: 20000 }).toBe(true)
  expect((await b.page.evaluate(() => window.mzansiWalk())).with).toBe(a.id)
  await expect.poll(async () => { const p = await pos(a.page); return Math.hypot(p.x - startA.x, p.z - startA.z) }, { timeout: 60000 }).toBeGreaterThan(12)
  await expect.poll(async () => { const p = await pos(b.page); return Math.hypot(p.x - startB.x, p.z - startB.z) }, { timeout: 60000 }).toBeGreaterThan(8)
  await expect(sheet(a.page), 'the chat sheet stays open while you walk').toBeVisible()
  await shot(a.page, 'walking-together-390')
  // both end up at the Library
  const door = await a.page.evaluate(() => window.mzansiPlaceOf('library').door)
  for (const p of [a, b]) await expect.poll(async () => { const at = await pos(p.page); return Math.hypot(at.x - door.x, at.z - door.z) }, { timeout: 120000 }).toBeLessThan(8)
  await shot(b.page, 'walked-together-b-390')
  for (const p of [a, b, c]) await p.ctx.close()
})
