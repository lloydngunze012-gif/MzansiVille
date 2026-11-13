// Loops and People (owner, 11 Nov), in the quick project. The chat's server is supabase/chat.sql on a real Postgres in
// this process (tests/chat-server.js); other players are played straight on that server.
//   P1 Order tonight, collect tomorrow: at Night the menu offers tomorrow's special for R5 off; next day "Your ... is
//      ready" when the game opens; Mama Liz's menu then starts with the paid plate and today's special.
//   P2 The streak and the badges: one finished activity a day; a missed day is covered by the week's free freeze; the
//      seventh day gives Seven Strong; follower milestones; the profile shows the streak and the badges, with the
//      ones that are "coming".
//   P3 Sharing: Invite a friend (a wa.me link with the player's code; the friend who finishes the quick start through
//      it gets R100 and so does the inviter, once), a top-10 placing, your own Board post; a group's flame in its header.
// (The Caf's board and the staff of a SunnyBay place are checked where those places already are: caf.spec.js and
// city-places-quick.spec.js. The race result's share button is in tests/presence/meet.spec.js territory: not run here.)
// Screenshots at 390 px (not committed): docs/sprints/loops/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate } from '../city.js'
import { chatServer } from '../chat-server.js'

const OUT = 'docs/sprints/loops'
const ROOM = `test-loops-${Date.now().toString(36)}`
const SPECIALS = JSON.parse(fs.readFileSync('data/campusville/specials.json', 'utf8')).specials
const SHARE = JSON.parse(fs.readFileSync('data/campusville/share.json', 'utf8'))
const P = (n) => ({ p_id: `${n}-test-player-0001`, p_secret: `${n}-secret-0123456789abcdef` })
test.setTimeout(300000)
test.use({ actionTimeout: 20000 })

let server
test.beforeAll(async () => { fs.mkdirSync(OUT, { recursive: true }); server = await chatServer() })
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')))
const patchRun = (page, patch) => page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); Object.assign(s.run, p); localStorage.setItem('mzansiville.v1', JSON.stringify(s)) }, patch)
const chat = (page) => page.evaluate(() => window.mzansiThreads())
const me = (page) => page.evaluate(() => { const p = JSON.parse(localStorage.getItem('mzansiville.presence')); return { p_id: p.id, p_secret: p.secret } })
const pop = (page) => page.locator('.sl-pop')
// A toast is on screen for 1.8 s and a busy test machine can stall a page for longer than that, so "it was said" is
// read from the game's own list of what it has said (window.mzansiToasts), not caught on the screen.
const said = (page, text, timeout = 15000) => expect.poll(() => page.evaluate((t) => (window.mzansiToasts || []).some((x) => x.includes(t)), text), { timeout, message: `the game said "${text}"` }).toBe(true)
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }) }
const sastDate = (offsetDays = 0) => new Date(Date.now() + 2 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
const again = async (page, q = '') => { await page.goto(`/?fast=1&morning=0&spawn=gate${q}#/play`); await page.reload(); await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 }) }

test('P1 order tonight for R5 off, "ready" the next day, and the paid plate first on Mama Liz’s menu', async ({ page }) => {
  await atGate(page, { name: 'Ayanda', patch: { day: 2, phase: 'night', minutes: 21 * 60 } })
  const tomorrow = SPECIALS[2] // (day 3)
  const dish = tomorrow.dish.replace(/^Friday special:\s*/i, '')
  const before = (await save(page)).run.stats.money
  await page.locator('[data-act="gear"]').tap()
  await page.locator('[data-act="preorder"]').tap()
  await expect(pop(page).locator('h2')).toHaveText(dish)
  await expect(pop(page)).toContainText(`R${tomorrow.price - 5}`)
  await expect(pop(page)).toContainText(tomorrow.says)
  await shot(page, 'preorder-390')
  await pop(page).locator('[data-lo="order"]').tap()
  await expect(pop(page)).toHaveCount(0)
  await expect(page.locator('.g-toast', { hasText: `Ordered: ${dish} for tomorrow` })).toBeVisible()
  const s = await save(page)
  expect(s.run.stats.money).toBe(before - (tomorrow.price - 5))
  expect(s.run.preorder).toMatchObject({ day: 3, dish, price: tomorrow.price - 5 })
  // tonight it cannot be ordered twice: the menu no longer offers it
  await page.locator('[data-act="gear"]').tap()
  await expect(page.locator('[data-act="preorder"]')).toHaveCount(0)
  await page.locator('.g-scrim[data-act="gear"]').tap({ position: { x: 12, y: 420 } }) // (beside the menu)
  // the next day, when the game opens: "Your ... is ready", once
  await patchRun(page, { day: 3, phase: 'social', minutes: 13 * 60 })
  await again(page)
  await expect(pop(page)).toHaveAttribute('aria-label', 'ready', { timeout: 30000 })
  await expect(pop(page)).toContainText(`Your ${dish.toLowerCase()} is ready. Collect it from Mama Liz at the Caf.`)
  await shot(page, 'ready-390')
  await pop(page).locator('[data-lo="ok"]').tap()
  // Mama Liz's menu for today: the paid plate, then today's special (the game's own modules, as it runs them)
  const menu = await page.evaluate(async () => {
    const run = JSON.parse(localStorage.getItem('mzansiville.v1')).run
    const { MENUS } = await import('/src/menus.js')
    const loops = await import('/src/loops.js')
    loops.dressMenu(MENUS.mama_liz, run)
    return MENUS.mama_liz.items.slice(0, 3).map((i) => [i.id, i.name, i.price, i.fx?.hunger > 30])
  })
  expect(menu[0]).toEqual(['collect', `Collect your ${dish} (paid)`, 0, true])
  expect(menu[1]).toEqual(['special', `Today’s special: ${dish}`, tomorrow.price, true])
  expect(menu[2][0]).toBe('bunny')
  // not collected by the day after: it has gone, and the player is told once
  await patchRun(page, { day: 4 })
  await again(page)
  await expect(pop(page)).toContainText('went to someone hungry', { timeout: 30000 })
  await pop(page).locator('[data-lo="ok"]').tap()
  expect((await save(page)).run.preorder).toBeUndefined()
})

test('P2 the streak (a day, a freeze, the seventh day), the badges, follower milestones, and the profile', async ({ page }) => {
  await server.routeChat(page)
  await atGate(page, { query: `&chat=1&room=${ROOM}-s`, name: 'Thando' })
  await expect.poll(async () => (await chat(page)).socialB, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  const act = () => page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-posted'))) // (a finished activity: a Board post is counted like any other)
  // the first activity of a day starts it; a second the same day changes nothing
  await act()
  await expect.poll(async () => (await save(page)).run.streak?.n).toBe(1)
  await act()
  expect((await save(page)).run.streak).toMatchObject({ n: 1, last: sastDate() })
  // six days running, the last one yesterday: today's activity makes seven, and Seven Strong
  await patchRun(page, { streak: { n: 6, last: sastDate(-1), best: 6, freezeWeek: -1 } })
  await again(page, `&chat=1&room=${ROOM}-s`)
  await act()
  await said(page, 'Seven Strong')
  await said(page, '7-day streak') // (after the badge, never on top of it)
  expect(await page.evaluate(() => { const t = window.mzansiToasts; return t.findIndex((x) => x.includes('Seven Strong')) < t.findIndex((x) => x.includes('7-day streak')) })).toBe(true)
  await expect.poll(async () => (await save(page)).run.streak?.n).toBe(7)
  expect((await save(page)).run.badges).toContain('seven_strong')
  // a missed day is covered by the week's free freeze, once; a second missed day that week starts again at 1
  await patchRun(page, { streak: { n: 3, last: sastDate(-2), best: 7, freezeWeek: -1 } })
  await again(page, `&chat=1&room=${ROOM}-s`)
  await act()
  await expect.poll(async () => (await save(page)).run.streak?.n).toBe(4)
  await said(page, 'Freeze used')
  const used = (await save(page)).run.streak.freezeWeek
  await patchRun(page, { streak: { n: 4, last: sastDate(-2), best: 7, freezeWeek: used } })
  await again(page, `&chat=1&room=${ROOM}-s`)
  await act()
  await expect.poll(async () => (await save(page)).run.streak?.n).toBe(1)
  // badges from what happens: a first friend, a first race, a first Greenway shop is wired the same way
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-race-done', { detail: { won: true } })))
  await expect.poll(async () => (await save(page)).run.badges).toContain('pier_starter')
  // follower milestones: ten players follow me
  for (let i = 0; i < 10; i++) { const f = P(`fan${i}`); await server.call('chat_sync', { ...f, p_name: `Fan ${i}` }); await server.call('chat_follow', { ...f, p_other: mine.p_id }) }
  await expect.poll(async () => (await save(page)).run.badges, { timeout: 60000 }).toContain('followers_10')
  expect((await save(page)).run.badges).not.toContain('followers_50')
  // the profile: the streak with its milestone and the freeze, and every badge with its state
  await page.goto('/?fast=1&morning=0#/profile')
  const streak = page.locator('.lo-card[data-streak]')
  await expect(streak).toContainText('1-day streak')
  await expect(streak).toContainText('6 more days to Seven Strong')
  await expect(streak).toContainText('This week’s freeze is used')
  await expect(streak).toContainText('Best: 7 days')
  const badges = page.locator('.lo-badges')
  await expect(badges.locator('summary')).toContainText('of 19')
  await badges.locator('summary').tap()
  await expect(badges.locator('li')).toHaveCount(19)
  await expect(badges.locator('li.earned[data-badge="seven_strong"]')).toContainText('A week of showing up')
  await expect(badges.locator('li.earned[data-badge="followers_10"]')).toBeVisible()
  await expect(badges.locator('li.coming')).toHaveCount(2)
  await expect(badges.locator('li.coming[data-badge="house_voice"] small')).toHaveText('Coming')
  await expect(page.locator('.pc-badge', { hasText: 'Seven Strong' })).toBeVisible() // (on the card too)
  await badges.scrollIntoViewIfNeeded()
  await shot(page, 'profile-streak-badges-390')
})

test('P3 invite a friend (R100 each, once), a top-10 placing and a Board post on WhatsApp, a group’s flame', async ({ page, browser }) => {
  await server.routeChat(page)
  await page.route('**/rest/v1/rpc/score_board', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ week: '2026-11-09', top: [{ rank: 1, name: 'Zoe', handle: 'zoe_1', house: 'Peak', points: 90 }], you: { rank: 4, points: 60 } }) }))
  await atGate(page, { query: `&chat=1&scores=1&room=${ROOM}-i`, name: 'Ayanda' })
  await expect.poll(async () => (await chat(page)).socialB, { timeout: 30000 }).toBe(true)
  const mine = await me(page)
  const money = (await save(page)).run.stats.money

  // Invite a friend: the menu, a wa.me link with one of the invite lines and the link carrying my code
  await page.locator('[data-act="gear"]').tap()
  await page.locator('[data-act="invite-friend"]').tap()
  const wa = pop(page).locator('a[data-wa-kind="invite"]')
  await expect(wa).toBeVisible({ timeout: 20000 })
  const text = decodeURIComponent((await wa.getAttribute('href')).replace('https://wa.me/?text=', ''))
  const code = (await server.rows('select ref_code from chat_players where id = $1', [mine.p_id]))[0].ref_code
  expect(SHARE.invite.map((l) => l.replace('[link]', `https://softlifeza.vercel.app/?ref=${code}`))).toContain(text)
  await expect(pop(page)).toContainText('R100 each')
  await shot(page, 'invite-390')
  await pop(page).locator('[data-lo="close"]').tap()

  // the friend opens the link, plays the quick start: R100 for them...
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  await server.routeChat(ctx)
  const friend = await ctx.newPage()
  await friend.goto(`/?fast=1&enrol=quick&morning=0&chat=1&room=${ROOM}-i&ref=${code}#/new`)
  await friend.locator('#name').fill('Lindi')
  await friend.locator('[data-act="qs-play"]').tap()
  await expect.poll(async () => (await friend.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1') || '{}').run?.refClaimed)), { timeout: 60000 }).toBe(true)
  // (a new student has R1,500 until the R600 pocket money at the drop-off: R100 on top of that)
  expect((await friend.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money))).toBe(1500 + 100)
  expect(await friend.evaluate(() => localStorage.getItem('mzansiville.ref'))).toBe(null)
  // ... and for the inviter, once (their next sync says so)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiToasts || [])).some((t) => t.includes('Lindi joined with your link: +R100')), { timeout: 60000 }).toBe(true) // (13 Nov: what was said, not a 1.8 s toast on screen)
  expect((await save(page)).run.stats.money).toBe(money + 100)
  expect((await server.rows('select count(*)::int as n from chat_refs where inviter = $1', [mine.p_id]))[0].n).toBe(1)
  await ctx.close()

  // a top-10 placing: the board has a WhatsApp button with one of the top-10 lines
  await page.evaluate(() => window.mzansiLaunch.openBoard())
  const top = pop(page).locator('.lp-share a[data-wa-kind="top10"]')
  await expect(top).toBeVisible({ timeout: 20000 })
  expect(SHARE.top10.map((l) => l.replace('[link]', 'https://softlifeza.vercel.app/'))).toContain(decodeURIComponent((await top.getAttribute('href')).replace('https://wa.me/?text=', '')))
  await pop(page).locator('[data-lo="close"], [data-lp="board-close"]').first().tap()

  // my own Board post has Share (never someone else's)
  await page.locator('.tb-chat').tap()
  await page.locator('.cht-tabs [data-tab="feed"]').tap()
  await page.locator('.bd-mine [data-board]').tap()
  await page.locator('.bd-new input').fill('Kettle is on. Who is in?')
  await page.locator('.bd-new button[type="submit"]').tap()
  const share = page.locator('.bd-post .wa-btn')
  await expect(share).toHaveCount(1)
  expect(decodeURIComponent(await share.getAttribute('href'))).toContain('“Kettle is on. Who is in?”')
  await page.locator('.cht-back').first().tap()
  await expect(page.locator('.bd-post .wa-btn')).toHaveCount(0)

  // a group's flame: three members active today light it; it shows in the group's header
  const [B, C] = [P('bonga'), P('chloe')]
  for (const [who, name] of [[B, 'Bonga Dube'], [C, 'Chloe Smith']]) await server.call('chat_sync', { ...who, p_name: name })
  const g = (await server.call('chat_group_create', { ...B, p_name: 'Kettle Committee', p_topic: '' })).body.thread
  const gcode = (await server.rows('select code from chat_threads where id = $1', [g]))[0].code
  for (const who of [C, mine]) await server.call('chat_group_join', { ...who, p_code: gcode })
  for (const who of [B, C]) await server.call('chat_sync', who)
  await page.locator('.cht-tabs [data-tab="chats"]').tap()
  await expect.poll(async () => (await chat(page)).threads.find((t) => t.id === g)?.flame, { timeout: 60000 }).toBe(1)
  await page.locator(`.cht-row[data-thread="${g}"]`).tap()
  await expect(page.locator('.cht-flame')).toHaveText(/1/)
  await shot(page, 'group-flame-390')
})
