// Social A (owner, 11 Nov), one phone, in the quick project. The server is supabase/chat.sql on a real Postgres
// in this process (tests/chat-server.js); another player ("Bonga") is played straight on that server.
//   A1 Groups and friends: the Friends tab (online dot, Message), a group made from the sheet (a reserved name is
//      refused), add a friend to it, pin a topic, the WhatsApp invite (a wa.me link carrying the group's code),
//      mute (no ping, no badge), leave. Your room's Quad is in the list.
//   A2 A newcomer who opens an invite link lands in the group straight after the quick start.
//   A3 Wake-up: on the first open of the day, unread group messages show "Your groups said N things" once.
//   A4 The region dropdown: the right word per country (State, County, Province), optional, saved; none outside Africa.
// Screenshots at 390 px (not committed): docs/sprints/social-a/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/social-a'
const ROOM = `test-soca-${Date.now().toString(36)}`
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
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const bongaSays = async (thread, text) => {
  await server.rows("update chat_lines set at = at - interval '3 seconds' where sender = $1", [BONGA.p_id])
  const r = await server.call('chat_send', { ...BONGA, p_thread: thread, p_body: text })
  expect(r.body.ok, `Bonga's line: ${JSON.stringify(r.body)}`).toBe(true)
}

test('A1 friends and groups: make one, add a friend, pin a topic, invite by WhatsApp, mute, leave', async ({ page }) => {
  await server.routeChat(page)
  await atGate(page, { query: `&chat=1&room=${ROOM}-1`, name: 'Ayanda' })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  const state = await chat(page)
  expect(state.social, 'the server has Social A').toBe(true)
  expect(state.room).toBe(1)
  expect(state.threads.find((t) => t.id === 'quad')?.quad, 'room 1 talks in its own Quad').toBe(true)

  // Friends: Bonga is on my list (as if added from his card), online, one tap to message.
  const mine = await me(page)
  await server.call('chat_friend', { ...mine, p_other: BONGA.p_id })
  await server.call('chat_sync', BONGA)
  await page.locator('.tb-chat').tap()
  await expect(sheet(page)).toBeVisible()
  await page.locator('.cht-tabs [data-tab="friends"]').tap()
  const friend = page.locator(`.cht-friend[data-friend="${BONGA.p_id}"]`)
  await expect(friend).toBeVisible({ timeout: 40000 }) // (the next sync brings the list)
  await expect(friend.locator('.cht-dot.on')).toBeVisible()
  await expect(page.locator('.cht-tabs [data-tab="friends"]')).toContainText('1 online')
  await shot(page, 'friends-390')

  // A group: a reserved name is refused, a good one is made and opens on "Add people".
  await page.locator('.cht-tabs [data-tab="chats"]').tap()
  await page.locator('[data-ct="new"]').tap()
  await page.locator('.cht-new input').fill('Official admin')
  await page.locator('.cht-new button[type="submit"]').tap()
  await expect(page.locator('.cht-note')).toContainText('Pick another name')
  await page.locator('.cht-new input').fill('Biryani Council')
  await page.locator('.cht-new button[type="submit"]').tap()
  await expect(page.locator('.cht-info')).toBeVisible()
  const group = (await chat(page)).threads.find((t) => t.name === 'Biryani Council')
  expect(group?.code, 'the group has a code for its link').toMatch(/^[0-9a-f]{8}$/)
  // add a friend
  await page.locator(`.cht-info [data-add="${BONGA.p_id}"]`).tap()
  await expect(page.locator('.cht-note')).toHaveText('Added.')
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [group.id]))[0].n).toBe(2)
  await page.locator('.cht-rowbtns [data-ct="info"]').tap()
  await expect(page.locator('.cht-info .cht-friend')).toHaveCount(2)
  // the creator pins a topic
  await page.locator('.cht-topicform input').fill('Biryani on Friday?')
  await page.locator('.cht-topicform button[type="submit"]').tap()
  await expect(page.locator('.cht-note')).toHaveText('Pinned.')
  // invite by WhatsApp: a wa.me link with a short message and the game link carrying the code
  await page.locator('[data-ct="invite"]').tap()
  const wa = page.locator('a[data-wa]')
  await expect(wa).toBeVisible()
  const href = decodeURIComponent(await wa.getAttribute('href'))
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
  expect(href).toContain(`/?g=${group.code}`)
  expect(href).toContain('Biryani Council')
  await shot(page, 'group-page-390')
  // back in the thread the topic is pinned on top
  await page.locator('.cht-back[data-ct="thread"]').tap()
  await expect(page.locator('.cht-pin')).toContainText('Biryani on Friday?')
  await shot(page, 'group-thread-390')

  // Mute: Bonga talks, nothing pings and the badge stays empty; unmuted, the next one pings.
  await page.locator('.cht-open[data-ct="info"]').tap()
  await page.locator('[data-ct="mute"]').tap()
  await expect.poll(async () => (await chat(page)).threads.find((t) => t.id === group.id)?.muted).toBe(true)
  await page.locator('.cht-x').first().tap()
  await bongaSays(group.id, 'Who is bringing the rice?')
  await expect.poll(async () => (await chat(page)).threads.find((t) => t.id === group.id)?.last, { timeout: 40000 }).toBe('Who is bringing the rice?')
  expect((await chat(page)).unread, 'a muted group never counts on the badge').toBe(0)
  await expect(page.locator('.cht-ping')).toBeHidden()

  // Leave: two taps, and the group is gone from the list (Bonga now runs it).
  await page.locator('.tb-chat').tap()
  await page.locator(`.cht-row[data-thread="${group.id}"]`).tap()
  await page.locator('.cht-open[data-ct="info"]').tap()
  await page.locator('[data-ct="leave"]').tap()
  await expect(page.locator('[data-ct="leave"]')).toHaveText('Tap again to leave')
  await page.locator('[data-ct="leave"]').tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'list')
  expect((await chat(page)).threads.some((t) => t.id === group.id)).toBe(false)
  expect((await server.rows('select creator from chat_threads where id = $1', [group.id]))[0].creator).toBe(BONGA.p_id)
})

test('A2 an invite link: the newcomer lands in the group after the quick start', async ({ page }) => {
  await server.routeChat(page)
  const made = await server.call('chat_group_create', { ...BONGA, p_name: 'Kettle Committee', p_topic: 'Who used the last tea bag?' })
  const code = (await server.rows('select code from chat_threads where id = $1', [made.body.thread]))[0].code
  await page.goto(`/?fast=1&enrol=quick&morning=0&chat=1&room=${ROOM}-2&g=${code}#/new`)
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== 'mzansiville.groupInvite') localStorage.removeItem(k) })
  await page.reload()
  await expect(page.locator('.qs-card')).toHaveCount(8)
  expect(await page.evaluate(() => localStorage.getItem('mzansiville.groupInvite'))).toBe(code)
  await page.locator('#name').fill('Lindi')
  await page.locator('[data-act="qs-play"]').tap()
  // straight into the group: the sheet opens on it, the pinned topic on top
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread', { timeout: 60000 })
  expect((await chat(page)).open).toBe(made.body.thread)
  await expect(page.locator('.cht-title b')).toContainText('Kettle Committee')
  await expect(page.locator('.cht-pin')).toContainText('Who used the last tea bag?')
  expect(await page.evaluate(() => localStorage.getItem('mzansiville.groupInvite')), 'the code is used once').toBe(null)
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [made.body.thread]))[0].n).toBe(2)
})

test('A3 wake-up: "Your groups said N things" on the first open of the day, once', async ({ page }) => {
  await server.routeChat(page)
  await atGate(page, { query: `&chat=1&room=${ROOM}-3`, name: 'Thando' })
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  await expect(page.locator('.cht-wake')).toHaveCount(0) // (nothing unread: no card)
  const mine = await me(page)
  const g = await server.call('chat_group_create', { ...BONGA, p_name: 'Library Ghosts', p_topic: '' })
  await server.call('chat_group_add', { ...BONGA, p_thread: g.body.thread, p_other: mine.p_id })
  for (const line of ['Table by the window is free', 'Bring the notes', 'And a charger']) await bongaSays(g.body.thread, line)
  await page.evaluate(() => localStorage.removeItem('mzansiville.wake'))
  await page.reload()
  const wake = page.locator('.cht-wake')
  await expect(wake).toBeVisible({ timeout: 60000 })
  await expect(wake).toContainText('Your groups said 3 things')
  const box = await wake.boundingBox()
  expect(box.width, 'a small centred card').toBeLessThanOrEqual(420)
  await shot(page, 'wake-up-390')
  await wake.locator('.cht-wake-go').tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'list')
  await expect(page.locator(`.cht-row[data-thread="${g.body.thread}"] .cht-badge`)).toHaveText('3')
  // not again today
  await page.reload()
  await expect.poll(async () => (await chat(page)).status, { timeout: 30000 }).toBe('ready')
  await page.waitForTimeout(1500)
  await expect(page.locator('.cht-wake')).toHaveCount(0)
})

test('A4 the region dropdown: State for Nigeria, County for Kenya, Province for South Africa, none for France; optional and saved', async ({ page }) => {
  await page.goto('/?fast=1&enrol=quick&morning=0#/new')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload()
  const region = page.locator('.qs-panel select[data-region], .qs-panel select[data-province]')
  await expect(page.locator('.qs-panel select[data-province] option').first()).toHaveText('Province (optional)')
  await page.locator('.qs-panel select[data-country]').selectOption('Kenya')
  await expect(region.locator('option').first()).toHaveText('County (optional)')
  await expect(region.locator('option')).toHaveCount(48)
  await page.locator('.qs-panel select[data-country]').selectOption('France')
  await expect(region).toHaveCount(0)
  await page.locator('.qs-panel select[data-country]').selectOption('Nigeria')
  await expect(region.locator('option').first()).toHaveText('State (optional)')
  await region.selectOption('Lagos')
  await expect(page.locator('.qs-panel [data-province-pick] span')).toHaveText('Lagos')
  // the panel still fits one screen with the second dropdown beside the first
  expect(await page.evaluate(() => document.querySelector('[data-act="qs-play"]').getBoundingClientRect().bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true)
  await shot(page, 'region-390')
  await page.locator('#name').fill('Chidi')
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/(play|morning)/, { timeout: 30000 })
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.character)
  expect(c.country).toBe('Nigeria')
  expect(c.region).toBe('Lagos')
})
