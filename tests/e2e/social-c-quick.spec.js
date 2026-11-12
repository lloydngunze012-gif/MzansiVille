// Social C (owner, 11 Nov), one phone, in the quick project. The server is supabase/chat.sql on a real Postgres in
// this process (tests/chat-server.js); "Bonga" is played straight on that server.
//   C1 Find me: the card comes once a visit at a calm moment and says what it shares; Not now sends nothing; Yes
//      turns it on for today and the server gets a spot in the game (a district and a point on its map); the menu
//      turns it off and the spot is gone.
//   C2 A friend both ways who shares: "Bonga is on campus. Go to him / Say hi", once; the Friends tab has Go to;
//      Go to walks you there and stops about 2 m short.
//   C3 Open groups: the creator makes a group Open with an interest; a matching open group is offered once
//      ("... is talking Music. Join / Not now"); Not now keeps it away; Join puts you in and opens it; a member
//      who is not the creator can report the name or topic (two taps).
// Three phones: tests/presence/social-c.spec.js. Screenshots at 390 px (not committed): docs/sprints/social-c/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/social-c'
const ROOM = `test-socc-${Date.now().toString(36)}`
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
const find = (page) => page.evaluate(() => window.mzansiFind.state())
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const syncNow = (page) => page.evaluate(() => import('/src/threads.js').then((m) => m.sync()))
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const card = (page, kind) => page.locator(`.fm-card[data-fm="${kind}"]`)
const row = async (id) => (await server.rows('select find_day, spot from chat_players where id = $1', [id]))[0]
// (the card waits a few seconds into a visit; tests shorten that)
const Q = (name) => `&chat=1&findwait=1&room=${ROOM}-${name}`

test('C1 find me: the card once a visit, Not now sends nothing, Yes shares your spot in the game, the menu turns it off', async ({ page }) => {
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('a'), name: 'Ayanda' })
  await expect.poll(async () => (await chat(page)).socialC, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  // the card, at a calm moment, in plain words
  await expect(card(page, 'ask')).toBeVisible({ timeout: 30000 })
  await expect(card(page, 'ask')).toContainText('Let friends find you today?')
  await expect(card(page, 'ask')).toContainText('Only your spot in the game, never your real location.')
  await shot(page, 'find-card-390')
  // Not now: nothing is on, nothing was sent, and it does not come back this visit
  await card(page, 'ask').locator('[data-fm-act="no"]').tap()
  await expect(card(page, 'ask')).toHaveCount(0)
  await page.waitForTimeout(4000)
  await expect(card(page, 'ask')).toHaveCount(0)
  expect(await row(mine.p_id)).toEqual({ find_day: null, spot: null })
  expect((await find(page)).on).toBe(false)
  // the next visit: asked again; Yes turns it on for today and the server gets where you stand in the game
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await expect(card(page, 'ask')).toBeVisible({ timeout: 40000 })
  await card(page, 'ask').locator('[data-fm-act="yes"]').tap()
  await expect.poll(async () => (await find(page)).on, { timeout: 15000 }).toBe(true)
  await expect.poll(async () => (await row(mine.p_id)).spot, { timeout: 30000 }).toBeTruthy()
  const at = await page.evaluate(() => window.mzansiPlayerPos())
  const spot = (await row(mine.p_id)).spot
  expect(spot.part).toBe('campus')
  expect(Math.hypot(spot.x - at.x, spot.z - at.z)).toBeLessThan(3)
  expect(Object.keys(spot).sort(), 'a district and a point on the game map, nothing else').toEqual(['in', 'part', 'x', 'z'])
  // (never asked the browser where the phone really is)
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /geolocation/i.test(r.name)))).toBe(false)
  // already on: no card on the next visit that day
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await expect.poll(async () => (await find(page)).on, { timeout: 30000 }).toBe(true)
  await page.waitForTimeout(5000)
  await expect(card(page, 'ask')).toHaveCount(0)
  // the menu says so, and turns it off: the spot is gone from the server at once
  await page.locator('.tb-menu').tap()
  const sw = page.locator('.g-menu [data-act="find-toggle"]')
  await expect(sw).toContainText('On today')
  await shot(page, 'find-menu-390')
  await sw.tap()
  await expect.poll(async () => (await row(mine.p_id)).spot, { timeout: 15000 }).toBe(null)
  expect((await row(mine.p_id)).find_day).toBe(null)
  await expect(page.locator('.g-menu [data-act="find-toggle"]')).toContainText('Off')
  expect(errors).toEqual([])
})

test('C2 a friend who shares: the toast once, Go to in the Friends tab, and you walk to them and stop 2 m short', async ({ page }) => {
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('b'), name: 'Zinhle' })
  await expect.poll(async () => (await chat(page)).socialC, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  await card(page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  // Bonga, a friend both ways, said yes today and stands 14 m up the road from the gate
  await server.call('chat_friend', { ...mine, p_other: BONGA.p_id })
  await server.call('chat_friend', { ...BONGA, p_other: mine.p_id })
  // (open ground some 12 to 16 m from where I stand: where a player could really be standing)
  const there = await page.evaluate(() => {
    const p = window.mzansiPlayerPos()
    for (const [dx, dz] of [[0, -14], [-6, -12], [6, -12], [-10, -8], [10, -8], [-12, 0], [12, 0], [0, -18]]) if (window.mzansiOpen(p.x + dx, p.z + dz) && window.mzansiOpen(p.x + dx * 0.85, p.z + dz * 0.85)) return { x: p.x + dx, z: p.z + dz }
    return null
  })
  expect(there, 'open ground near the gate').toBeTruthy()
  await server.call('chat_find', { ...BONGA, p_on: true })
  const bongaIsHere = async () => { await server.call('chat_sync', BONGA); await server.call('chat_spot', { ...BONGA, p_part: 'campus', p_x: there.x, p_z: there.z, p_in: '' }) }
  await bongaIsHere()
  await syncNow(page)
  await expect(card(page, 'here')).toBeVisible({ timeout: 20000 })
  await expect(card(page, 'here')).toContainText('Bonga is on campus.')
  await expect(card(page, 'here').locator('[data-fm-act="go"]')).toHaveText('Go to him')
  await expect(card(page, 'here').locator('[data-fm-act="hi"]')).toHaveText('Say hi')
  await shot(page, 'friend-here-390')
  await card(page, 'here').locator('[data-fm-act="x"]').tap()
  // once per friend per visit: later syncs bring no second toast
  await bongaIsHere()
  await syncNow(page)
  await page.waitForTimeout(4000)
  await expect(card(page, 'here')).toHaveCount(0)
  // the Friends tab: Go to beside him
  await page.locator('.tb-chat').tap()
  await page.locator('.cht-tabs [data-tab="friends"]').tap()
  const friend = page.locator(`.cht-friend[data-friend="${BONGA.p_id}"]`)
  await expect(friend.locator('[data-goto]')).toHaveText('Go to')
  await expect(friend).toContainText('Sharing where they are today')
  await shot(page, 'friends-go-to-390')
  await friend.locator('[data-goto]').tap()
  await expect(page.locator('.cht-sheet')).toBeHidden()
  // you walk there and stop about 2 m short of him
  await expect.poll(async () => (await find(page)).going, { timeout: 5000 }).toBe(BONGA.p_id)
  const keep = setInterval(() => { bongaIsHere().catch(() => {}) }, 4000) // (he stays online while you walk)
  try {
    await expect.poll(async () => (await find(page)).going, { timeout: 90000 }).toBe('')
  } finally { clearInterval(keep) }
  const end = await page.evaluate(() => window.mzansiPlayerPos())
  const gap = Math.hypot(end.x - there.x, end.z - there.z)
  expect(gap, 'beside him, not on him').toBeGreaterThan(1.2)
  expect(gap).toBeLessThan(3.2)
  expect(await page.evaluate(() => window.mzansiToasts.some((t) => t.includes('You found Bonga'))), 'told you are there').toBe(true)
  await shot(page, 'found-390')
  // somebody who is not a friend both ways is never offered (the server leaves their spot out: sql-check)
  expect((await chat(page)).sharing.map((f) => f.id)).toEqual([BONGA.p_id])
  expect(errors).toEqual([])
})

test('C3 open groups: the creator opens one with an interest; a matching one is offered once; Not now, then Join; a member reports it', async ({ page }) => {
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('c'), name: 'Lerato' })
  await expect.poll(async () => (await chat(page)).socialC, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  await card(page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  // ---- my own group: Private until I open it with an interest ----
  await page.locator('.tb-chat').tap()
  await page.locator('[data-ct="new"]').tap()
  await page.locator('.cht-new input').fill('Braai Sundays')
  await page.locator('.cht-new button[type="submit"]').tap()
  await expect(page.locator('.cht-info')).toBeVisible()
  await page.locator('.cht-rowbtns [data-ct="info"]').tap()
  const g = (await chat(page)).threads.find((t) => t.name === 'Braai Sundays')
  await expect(page.locator('.cht-openrow')).toHaveAttribute('data-listed', '0')
  await page.locator('.cht-openrow [data-ct="open"]').tap()
  await expect(page.locator('.cht-tags [data-tag]')).toHaveCount(12)
  await shot(page, 'group-open-pick-390')
  await page.locator('.cht-tags [data-tag="food"]').tap()
  await expect(page.locator('.cht-openrow')).toHaveAttribute('data-listed', '1', { timeout: 15000 })
  await expect(page.locator('.cht-openrow [data-ct="open"]')).toContainText('Open: Food')
  expect((await server.rows('select listed, tag from chat_threads where id = $1', [g.id]))[0]).toEqual({ listed: true, tag: 'food' })
  // (its creator has no Report button on it)
  await expect(page.locator('[data-ct="report-group"]')).toHaveCount(0)
  await page.locator('.cht-openrow [data-ct="private"]').tap()
  await expect(page.locator('.cht-openrow')).toHaveAttribute('data-listed', '0', { timeout: 15000 })
  await page.locator('.cht-x').first().tap()

  // ---- Bonga's open group about Music; my interests include Music ----
  const his = (await server.call('chat_group_create', { ...BONGA, p_name: 'Sunday Sessions', p_topic: 'What are we playing this week?' })).body.thread
  await server.call('chat_group_open', { ...BONGA, p_thread: his, p_on: true, p_tag: 'music' })
  await server.call('chat_interests', { ...mine, p_list: ['music', 'food'] })
  // the next visit: one suggestion, at a calm moment
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await card(page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  await expect(card(page, 'group')).toBeVisible({ timeout: 40000 })
  await expect(card(page, 'group')).toContainText('Sunday Sessions (1 member) is talking Music.')
  await expect(card(page, 'group').locator('[data-fm-act="join"]')).toHaveText('Join')
  await expect(card(page, 'group').locator('[data-fm-act="no"]')).toHaveText('Not now')
  await shot(page, 'group-suggested-390')
  // Not now: kept away for 7 days on the server
  await card(page, 'group').locator('[data-fm-act="no"]').tap()
  await expect.poll(async () => (await server.rows('select count(*)::int as n from chat_group_snoozes where thread = $1 and player = $2 and until > now() + interval \'6 days\'', [his, mine.p_id]))[0].n, { timeout: 15000 }).toBe(1)
  // a week on (the server's clock moved for the test): offered again, and Join puts me in and opens it
  await server.rows('update chat_group_snoozes set until = now() - interval \'1 minute\'')
  await server.rows('update chat_players set suggest_day = null')
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await card(page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  await expect(card(page, 'group')).toBeVisible({ timeout: 40000 })
  await card(page, 'group').locator('[data-fm-act="join"]').tap()
  await expect(page.locator('.cht-sheet')).toHaveAttribute('data-view', 'thread', { timeout: 20000 })
  await expect(page.locator('.cht-title b')).toContainText('Sunday Sessions')
  expect((await server.rows('select count(*)::int as n from chat_members where thread = $1', [his]))[0].n).toBe(2)
  // a member who did not make the group can report its name or topic: two taps
  await page.locator('.cht-open[data-ct="info"]').tap()
  await expect(page.locator('.cht-openrow')).toHaveCount(0) // (only its creator opens or closes it)
  const report = page.locator('[data-ct="report-group"]')
  await report.scrollIntoViewIfNeeded()
  await report.tap()
  await expect(page.locator('[data-ct="report-group"]')).toHaveText('Tap again to report')
  await page.locator('[data-ct="report-group"]').tap()
  await expect(page.locator('.cht-note')).toHaveText('Reported. Thank you.')
  expect((await server.rows('select reporter, name, topic from chat_group_reports where thread = $1', [his]))[0]).toEqual({ reporter: mine.p_id, name: 'Sunday Sessions', topic: 'What are we playing this week?' })
  expect(errors).toEqual([])
})

test('C4 Go to a friend in another district: out of the gate, a taxi at the usual fare, then on foot to 2 m short', async ({ page }) => {
  await server.routeChat(page)
  const errors = await atGate(page, { query: Q('d'), name: 'Thando' })
  await expect.poll(async () => (await chat(page)).socialC, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  await card(page, 'ask').locator('[data-fm-act="no"]').tap({ timeout: 40000 })
  await server.call('chat_friend', { ...mine, p_other: BONGA.p_id })
  await server.call('chat_friend', { ...BONGA, p_other: mine.p_id })
  // Bonga shares, and he is in Town centre, a little way from its taxi stop
  const there = { x: -8, z: 236 }
  await server.call('chat_find', { ...BONGA, p_on: true })
  const bongaIsThere = async () => { await server.call('chat_sync', BONGA); await server.call('chat_spot', { ...BONGA, p_part: 'town', p_x: there.x, p_z: there.z, p_in: '' }) }
  await bongaIsThere()
  await syncNow(page)
  await expect(card(page, 'here')).toContainText('Bonga is in Town centre.', { timeout: 20000 })
  const before = (await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)).stats.money
  await card(page, 'here').locator('[data-fm-act="go"]').tap()
  const keep = setInterval(() => { bongaIsThere().catch(() => {}) }, 4000)
  try {
    // out through the gate into SunnyBay, one taxi, and there
    await expect(page.locator('#city3d')).toHaveAttribute('data-ready', '1', { timeout: 120000 })
    await expect(page.locator('#city3d')).toHaveAttribute('data-rides', '1', { timeout: 120000 })
    await expect.poll(async () => (await find(page)).going, { timeout: 120000 }).toBe('')
  } finally { clearInterval(keep) }
  expect(await page.evaluate(() => window.mzansiToasts.some((t) => t.includes('You found Bonga'))), 'told you are there').toBe(true)
  const end = await page.evaluate(() => { const h = document.querySelector('#city3d'); return { x: Number(h.dataset.px), z: Number(h.dataset.pz), part: h.dataset.part, rides: h.dataset.rides, fare: Number(h.dataset.fare) } })
  expect(end.part).toBe('town')
  expect(end.rides, 'one taxi, not two').toBe('1')
  const gap = Math.hypot(end.x - there.x, end.z - there.z)
  expect(gap, 'beside him, not on him').toBeGreaterThan(1.2)
  expect(gap).toBeLessThan(3.4)
  // the fare as usual: campus to the next district is R15, paid once
  expect(end.fare).toBe(15)
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)).stats.money).toBe(before - 15)
  await shot(page, 'found-in-town-390')
  expect(errors).toEqual([])
})
