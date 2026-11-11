// Social B (owner, 11 Nov), one phone, in the quick project. The server is supabase/chat.sql on a real Postgres in
// this process (tests/chat-server.js); other players are played straight on that server.
//   B1 The Feed is never empty (the named people's posts); a stamp; a player's Board from the Feed, Follow and the
//      follower count; their posts then lead the Feed; Replies are a chat thread off the post; your own Board:
//      post, 140 characters, no links, 3 a day; Report (two taps), and three reports hide a post; the follower
//      count on a leaderboard row; "+N followers while you were away".
//   B2 Interests: pick 3 of 12 (a fourth is refused), their groups land in your chats, the picker comes at the end
//      of the student-card flow; the SunnyBay Daily: today's topic with "Join the conversation" into its group,
//      the Post of the day, the Caf special, the top 3 of each board, who joined today.
// Screenshots at 390 px (not committed): docs/sprints/social-b/ (feed, board, interests, daily).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/social-b'
const ROOM = `test-socb-${Date.now().toString(36)}`
const P = (n) => ({ p_id: `${n}-test-player-0001`, p_secret: `${n}-secret-0123456789abcdef` })
const [BONGA, CHLOE, DAVID] = [P('bonga'), P('chloe'), P('david')]
test.setTimeout(300000)
test.use({ actionTimeout: 20000 })

let server
test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  server = await chatServer()
  await server.call('chat_sync', { ...BONGA, p_name: 'Bonga Dube', p_handle: 'bonga_d', p_house: 'Peak', p_look: { gender: 'male', skin: 'deep', hair: 'fade', outfit: 'hoodie' } })
  await server.call('chat_sync', { ...CHLOE, p_name: 'Chloe Smith', p_handle: 'chloe_s', p_house: 'Braam', p_look: { gender: 'female', skin: 'fair', hair: 'crop', outfit: 'jacket' } })
  await server.call('chat_sync', { ...DAVID, p_name: 'David Okafor', p_handle: 'david_o', p_house: 'Mzansi House', p_look: { gender: 'male', skin: 'deep', hair: 'crop', outfit: 'shirt' } })
})
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const sheet = (page) => page.locator('.cht-sheet')
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const ROWS = [{ rank: 1, name: 'Bonga Dube', handle: 'bonga_d', house: 'Peak', points: 90 }, { rank: 2, name: 'Chloe Smith', handle: 'chloe_s', house: 'Braam', points: 70 }, { rank: 3, name: 'David Okafor', handle: 'david_o', house: 'Mzansi House', points: 50 }, { rank: 4, name: 'Zoe', handle: 'zoe_1', house: 'Peak', points: 40 }]
const mockBoards = (page) => page.route('**/rest/v1/rpc/score_board', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ week: '2026-11-09', top: ROWS, you: { rank: 12, points: 30 } }) }))

test('B1 the Feed, a stamp, a Board with Follow, replies, your own posts and their limits, reports, follower counts', async ({ page }) => {
  await server.routeChat(page)
  await mockBoards(page)
  const bonga = (await server.call('chat_post', { ...BONGA, p_body: 'Pier at dusk. Who is racing?', p_district: 'campus' })).body.post
  await atGate(page, { query: `&chat=1&scores=1&room=${ROOM}-a`, name: 'Ayanda' })
  await expect.poll(async () => (await chat(page)).socialB, { timeout: 30000 }).toBe(true)
  const mine = await me(page)

  // The Feed: never empty. The named people's posts are there; today's hot post in my district leads them.
  await page.locator('.tb-chat').tap()
  await page.locator('.cht-tabs [data-tab="feed"]').tap()
  await expect(page.locator('.bd-post')).toHaveCount(21, { timeout: 20000 })
  await expect(page.locator('.cht-sub').first()).toHaveText('Hot in Campus today')
  await expect(page.locator('.bd-post').first()).toContainText('Pier at dusk. Who is racing?')
  await expect(page.locator('.bd-post', { hasText: 'The gravy is still here and so am I.' })).toContainText('Mama Liz')
  expect((await sheet(page).boundingBox()).width, 'a centred card').toBeLessThanOrEqual(420)
  // a stamp: one each, on and off
  const stamp = page.locator(`[data-stamp="${bonga.id}"]`)
  await stamp.tap()
  await expect(stamp).toHaveAttribute('aria-pressed', 'true')
  await expect(stamp.locator('span')).toHaveText('1')
  expect((await server.rows('select count(*)::int as n from chat_stamps where post = $1', [bonga.id]))[0].n).toBe(1)
  await shot(page, 'feed-390')

  // His Board from the Feed: the follower count, Follow.
  await page.locator(`.bd-who[data-board="${BONGA.p_id}"]`).first().tap()
  await expect(page.locator('.cht-title b')).toHaveText('Bonga Dube’s Board')
  await expect(page.locator('[data-bd-followers]')).toHaveText('0 followers')
  await page.locator(`[data-follow="${BONGA.p_id}"]`).tap()
  await expect(page.locator('[data-bd-followers]')).toHaveText('1 follower')
  await expect(page.locator(`[data-follow="${BONGA.p_id}"]`)).toHaveText('Following ✓')
  // Replies: a chat thread hanging off the post, the post pinned on top
  await page.locator(`[data-replies="${bonga.id}"]`).tap()
  await expect(sheet(page).locator('.cht-form input')).toBeVisible()
  await expect(page.locator('.cht-pin')).toContainText('Pier at dusk. Who is racing?')
  await page.locator('.cht-form input').fill('Me. Bring water.')
  await page.locator('.cht-form button[type="submit"]').tap()
  await expect(page.locator('.cht-lines li.me')).toHaveCount(1)
  expect((await server.rows('select body from chat_lines where thread = $1', [`p:${bonga.id}`]))[0].body).toBe('Me. Bring water.')
  expect((await chat(page)).threads.some((t) => t.id.startsWith('p:')), 'replies never clutter the chat list').toBe(false)
  // back in the Feed, the people I follow come first
  await page.locator('.cht-back').first().tap()
  await page.locator('.cht-tabs [data-tab="feed"]').tap()
  await expect(page.locator('.cht-sub').first()).toHaveText('People you follow')
  await expect(page.locator('.bd-post').first().locator('.bd-reply')).toHaveText(/1 reply/)

  // My Board: a post, a link refused, 3 a day.
  await page.locator('.bd-mine [data-board]').tap()
  await expect(page.locator('.cht-title b')).toHaveText('Your Board')
  const post = async (text) => { await page.locator('.bd-new input').fill(text); await page.locator('.bd-new button[type="submit"]').tap() }
  await post('First day. The Caf queue already knows my name.')
  await expect(page.locator('.cht-note')).toHaveText('Posted.')
  await expect(page.locator('.bd-post')).toHaveCount(1)
  expect(await page.locator('.bd-new input').getAttribute('maxlength')).toBe('140')
  await post('cheap airtime at www.scam.example')
  await expect(page.locator('.cht-note')).toContainText('No links on the Board')
  await post('Second one')
  await expect(page.locator('.bd-post')).toHaveCount(2)
  await post('Third one')
  await expect(page.locator('.bd-post')).toHaveCount(3)
  await post('A fourth')
  await expect(page.locator('.cht-note')).toContainText('3 posts for today')
  expect((await server.rows('select count(*)::int as n from chat_posts where author = $1', [mine.p_id]))[0].n).toBe(3)
  await shot(page, 'board-390')

  // Report: two taps; with two more from other players the post is hidden until reviewed.
  await page.locator('.cht-back').first().tap()
  const report = page.locator(`[data-report-post="${bonga.id}"]`)
  await report.tap()
  await expect(report).toHaveText('Tap again to report')
  await report.tap()
  await expect(page.locator('.cht-note')).toContainText('A moderator will look at it')
  for (const who of [CHLOE, DAVID]) await server.call('chat_post_report', { ...who, p_post: bonga.id, p_reason: 'test' })
  await page.locator('.cht-tabs [data-tab="chats"]').tap()
  await page.locator('.cht-tabs [data-tab="feed"]').tap()
  await expect(page.locator('.bd-post')).toHaveCount(20, { timeout: 20000 })
  await expect(page.locator('.bd-post', { hasText: 'Pier at dusk' })).toHaveCount(0)
  await page.locator('.cht-x').first().tap()

  // The follower count on a leaderboard row (by @handle).
  await page.evaluate(() => window.mzansiLaunch.openBoard())
  await expect(page.locator('.sl-pop .lp-list li').first()).toContainText('1 follower', { timeout: 20000 })
  await expect(page.locator('.sl-pop .lp-list li').nth(1)).not.toContainText('follower')
  await page.locator('[data-lp="board-close"]').tap()

  // "+N followers while you were away": two followed me while I was gone.
  for (const who of [BONGA, CHLOE]) await server.call('chat_follow', { ...who, p_other: mine.p_id })
  await page.reload()
  await expect(page.locator('.g-toast', { hasText: '+2 followers while you were away' })).toBeVisible({ timeout: 60000 })
  expect((await chat(page)).followers).toBe(2)
})

test('B2 interests (pick 3, their groups) and the SunnyBay Daily (topic, Join the conversation, post, special, top 3, who joined)', async ({ page }) => {
  await server.routeChat(page)
  await mockBoards(page)
  await atGate(page, { query: `&chat=1&scores=1&room=${ROOM}-b`, name: 'Thando', patch: { interestsAsk: true } })
  await expect.poll(async () => (await chat(page)).socialB, { timeout: 30000 }).toBe(true)

  // The picker comes by itself at a calm moment (the end of the student-card flow sets it).
  const pop = page.locator('.sl-pop')
  await expect(pop).toBeVisible({ timeout: 30000 })
  await expect(pop.locator('.dy-pick')).toHaveCount(12)
  const topic = await page.evaluate(() => window.mzansiDaily.topic())
  const others = ['faith', 'art', 'movies', 'gaming', 'fashion'].filter((t) => !topic.tags.includes(t))
  for (const id of [topic.tags[0], others[0], others[1]]) await pop.locator(`[data-interest="${id}"]`).tap()
  await expect(pop.locator('[data-dy-count]')).toHaveText('3 of 3 picked')
  await pop.locator(`[data-interest="${others[2]}"]`).tap() // a fourth
  await expect(pop.locator('.dy-pick[aria-pressed="true"]')).toHaveCount(3)
  await shot(page, 'interests-390')
  await pop.locator('[data-dy="save"]').tap()
  await expect(pop).toHaveCount(0)
  // their groups are in my chats; the save and the server both have the picks
  await expect.poll(async () => (await chat(page)).threads.filter((t) => t.id.startsWith('i:')).length, { timeout: 30000 }).toBe(3)
  expect((await chat(page)).interests).toEqual([topic.tags[0], others[0], others[1]])
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(s.character.interests).toEqual([topic.tags[0], others[0], others[1]])
  expect(s.interestsAsk).toBeUndefined()

  // The Daily.
  await page.evaluate(() => window.mzansiDaily.open())
  await expect(pop).toHaveAttribute('aria-label', 'daily')
  await expect(pop.locator('.dy-q')).toHaveText(topic.question)
  await expect(pop).toContainText(topic.opener)
  const special = await page.evaluate(() => window.mzansiDaily.special(1))
  expect(special.dish).toBe('Pap, wors and gravy')
  await expect(pop).toContainText('Pap, wors and gravy · R35')
  await expect(pop).toContainText('Post of the day')
  await expect(pop.locator('.dy-board')).toHaveCount(3, { timeout: 20000 })
  await expect(pop.locator('.dy-board').first()).toContainText('Bonga Dube')
  await expect(pop.locator('.dy-board').first().locator('span')).toHaveCount(3) // the top 3, not the top 10
  await expect(pop.locator('.dy-line')).toContainText('joined today', { timeout: 20000 })
  const box = await pop.boundingBox()
  expect(box.width).toBeLessThanOrEqual(420)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  await shot(page, 'daily-390')
  // "Join the conversation": into the topic's group (one of my picks)
  await pop.locator('[data-dy="join"]').tap()
  await expect(sheet(page)).toHaveAttribute('data-view', 'thread')
  expect((await chat(page)).open).toBe(`i:${topic.tags[0]}`)
  await page.locator('.cht-form input').fill('Count me in.')
  await page.locator('.cht-form button[type="submit"]').tap()
  await expect(page.locator('.cht-lines li.me')).toHaveCount(1)
  // the Feed's header shows my interests, with Edit
  await page.locator('.cht-back').first().tap()
  await page.locator('.cht-tabs [data-tab="feed"]').tap()
  await expect(page.locator('.bd-mine [data-ct="interests"]')).toHaveText('Edit')
})
