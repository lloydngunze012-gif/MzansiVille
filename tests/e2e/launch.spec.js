// Launch safety, quick start and leaderboard (owner, 9 Nov). At phone size (390 px), tapped like a player.
//   L1  a new player goes from the link to the home scene in under 30 s: one screen, eight students, Play
//   L2  swap roommate at the house door at the drop-off: the roommate introduces themselves, four cards, the pick stays
//   L3  the card prompt: after the first meal, never during a walk, R200 once, at most once a day, old saves never
//   L4  the leaderboard: a returning player gets the card, a new one does not; three tabs, top 10, "You: #N"
//   L5  launch safety: errors capped at 20 an hour, funnel steps in order, #/health, feedback (menu and third session)
//   O1  the opening page: the picked student's hero is a real 3D render (not the flat placeholder), and tapping
//       another portrait swaps it for that student's own render
//   O2  a blocked backdrop still looks good (the sunset gradient alone), and Play never waits for it
//   O3  an empty name shakes the field and says so; Play's gold button never greys out
//   O4  the name and the handle both pass handle_blocklist.json before Play works
// The score RPC's daily limit is tested against real Postgres in scripts/sql-check.mjs (npm run check).
// Screenshots (on the PC, not committed): docs/sprints/launch/.
// Run: npx playwright test tests/e2e/launch.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import BLOCKLIST from '../../data/campusville/handle_blocklist.json' with { type: 'json' }

const OUT = 'docs/sprints/launch'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(300000)

const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')))
const patchRun = (page, patch) => page.evaluate((p) => {
  const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
  Object.assign(s.run, p)
  localStorage.setItem('mzansiville.v1', JSON.stringify(s))
  localStorage.setItem('mzansiville.mapHint', '1')
}, patch)
const shot = async (page, name) => { fs.mkdirSync(OUT, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${name}.png` }) }

// A visit to the game some time after the last one. (The game notes the end of a visit when its page goes away, so the
// last-seen time is set from a plain same-origin file, then the game opens: that is a later session, as on a phone.)
async function visit(page, url, { sessions, hoursAgo } = {}) {
  await page.goto('/manifest.webmanifest')
  await page.evaluate(([n, h]) => {
    const s = JSON.parse(localStorage.getItem('mzansiville.sessions') || '{"n":1,"last":0}')
    if (n != null) s.n = n
    if (h != null) s.last = Date.now() - h * 3600 * 1000
    localStorage.setItem('mzansiville.sessions', JSON.stringify(s))
  }, [sessions ?? null, hoursAgo ?? null])
  await page.goto(url)
}

// A new phone: no save, rules not yet asked.
async function brandNew(page, query = '') {
  await page.goto(`/?fast=1&enrol=quick${query}#/new`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload() // (a real load of the cleared phone: the same address with a hash would not reload the page)
}
// A quick-start student standing on the campus at a calm moment.
async function onCampus(page, { query = '', patch = {}, student = 'q-priya', name = 'Lerato' } = {}) {
  await brandNew(page, `&morning=0${query}`)
  await page.locator(`[data-preset="${student}"]`).tap()
  await page.locator('#name').fill(name)
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await patchRun(page, { morningDone: true, resMorningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true, lectureRoute: false, ...patch })
  await page.goto(`/?fast=1&morning=0${query}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  // (a first-visit hint or the house door card, if any)
  for (let i = 0; i < 3; i++) {
    const card = page.locator('[role="dialog"] button:visible').first()
    if (!(await card.isVisible().catch(() => false))) break
    await card.tap()
    await page.waitForTimeout(600)
  }
  const out = page.locator('.house-out')
  if (await out.isVisible().catch(() => false)) { await out.tap(); await page.waitForTimeout(600) }
}

test('L1 a new player goes from the link to the home scene in under 30 s: one screen, eight students, Play', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const t0 = Date.now()
  await page.goto('/?fast=1&enrol=quick#/new')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  const t1 = Date.now()
  await page.reload()
  await expect(page.locator('.qs')).toBeVisible()
  // ONE screen: eight ready-made students, a name, the country, Play. No steps, no dots, no Next.
  await expect(page.locator('.qs-card')).toHaveCount(8)
  await expect(page.locator('.en-dots, [data-act="enrol-next"], [data-act="enrol-skip"]')).toHaveCount(0)
  const looks = await page.locator('.qs-card').evaluateAll((els) => els.map((e) => e.dataset.preset))
  expect(looks).toEqual(['q-naledi', 'q-emma', 'q-amy', 'q-priya', 'q-thabo', 'q-sam', 'q-jason', 'q-dev'])
  await expect(page.locator('.qs-card[aria-pressed="true"]')).toHaveCount(1)
  await expect(page.locator('select[data-country]')).toHaveValue('South Africa')
  const name = page.locator('#name')
  await expect(name).toHaveValue('') // (the player's own name is mandatory: never a fake default in the field)
  await expect(page.locator('[data-act="qs-play"]')).toBeVisible()
  // everything fits one 390 x 844 screen: nothing to scroll to
  const fits = await page.evaluate(() => { const b = document.querySelector('[data-act="qs-play"]').getBoundingClientRect(); return b.bottom <= innerHeight && document.documentElement.scrollHeight <= innerHeight + 2 })
  expect(fits, 'the quick start fits one screen').toBe(true)
  await shot(page, 'quick-start-390')
  // pick another student, type a name, Play
  await page.locator('[data-preset="q-thabo"]').tap()
  await expect(page.locator('.qs-card[aria-pressed="true"]')).toHaveAttribute('data-preset', 'q-thabo')
  await name.fill('Sipho Dlamini')
  await expect(page.locator('[data-qs-handle]')).toContainText('@sipho_dlamini')
  await page.locator('[data-act="qs-play"]').tap()
  const host = page.locator('#home3d')
  await expect(host).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  const seconds = (Date.now() - t1) / 1000
  console.log(`link -> home scene ready: ${seconds.toFixed(1)} s (page load included)`)
  expect(seconds, 'link to walking in').toBeLessThan(30)
  const s = await save(page)
  expect(s.run.quick).toBe(true)
  expect(s.rulesAccepted).toBe(true)
  expect(s.run.character).toMatchObject({ name: 'Sipho Dlamini', country: 'South Africa' })
  expect(s.run.character.avatar).toMatchObject({ gender: 'male', skin: 'deep', hair: 'fade' })
  expect(s.run.character.handle).toMatch(/^sipho_dlamini/)
  expect(s.run.character.residence).toBeTruthy()
  expect(s.run.character.course).toBeTruthy()
  expect(s.run.bestieName).toBe('Marcus') // (men's res, the skin closest to deep)
  // the funnel: link opened, Play tapped, in that order
  const steps = await page.evaluate(() => window.__funnel.map((f) => f.step))
  expect(steps.slice(0, 2)).toEqual(['link_opened', 'play_tapped'])
  void t0
  expect(errors).toEqual([])
})

test('L1b a name that is too short or not allowed stays on the screen; a returning player never sees the quick start', async ({ page }) => {
  await brandNew(page)
  await page.locator('#name').fill('A')
  await page.locator('[data-act="qs-play"]').tap()
  await expect(page.locator('.en-err')).toContainText('at least 2 letters')
  await expect(page.locator('.qs')).toBeVisible()
  // a saved student: the title offers Continue, not Enrol
  await onCampus(page, { name: 'Lerato' })
  await page.goto('/?fast=1&morning=0#/')
  await expect(page.locator('[data-act="continue"]')).toBeVisible()
  await expect(page.locator('[data-act="start"]')).toHaveCount(0)
})

// ---------- O1/O2/O3/O4 the opening page ----------
test('O1 the hero is the real 3D model, and swaps (with its own render) when another portrait is tapped', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await brandNew(page)
  const hero = page.locator('.qs-heropic')
  // a known baseline pick, whatever the random preselect landed on (same pick is a no-op, a real
  // change bounces once): either way it settles on Naledi with her own render
  await page.locator('[data-preset="q-naledi"]').tap()
  await expect(hero.locator('img')).toBeVisible({ timeout: 15000 })
  const first = await hero.locator('img').getAttribute('src')
  expect(first).toMatch(/^data:image\/png/)
  await shot(page, 'opening-390')
  // a different student: a bounce plays, and the hero becomes THEIR own render (a different picture)
  await page.locator('[data-preset="q-dev"]').tap()
  await expect(hero).toHaveClass(/qs-bounce/)
  await expect(hero.locator('img')).toBeVisible({ timeout: 15000 })
  const second = await hero.locator('img').getAttribute('src')
  expect(second).not.toBe(first)
  // tapping the same, already-selected portrait again does nothing (the game's usual "already
  // selected" tap, scene.js pulse): the pick and its render are undisturbed
  await page.locator('[data-preset="q-dev"]').tap()
  await expect(page.locator('.qs-card[aria-pressed="true"]')).toHaveAttribute('data-preset', 'q-dev')
  await expect(hero.locator('img')).toHaveAttribute('src', second)
  expect(errors).toEqual([])
})

test('O2 a blocked backdrop still looks good (the gradient alone), and Play works before it loads', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  // the backdrop images never arrive (blocked, or just painfully slow): the page never waits on them,
  // so this goes straight for DOM content, not the full (image-inclusive) load event
  await page.route('**/opening-bg-*.webp', () => new Promise(() => {})) // (never resolves)
  await page.goto('/?fast=1&enrol=quick#/new', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const backdrop = page.locator('.qs-backdrop')
  await expect(backdrop).toBeVisible()
  const bg = await backdrop.evaluate((el) => getComputedStyle(el).backgroundImage)
  expect(bg).toContain('linear-gradient') // (the sunset gradient is always in the layer list, image or not)
  await shot(page, 'opening-blocked-390')
  // Play still works: the screen never waited on the backdrop
  await page.locator('#name').fill('Lerato')
  await page.locator('[data-act="qs-play"]').tap()
  await expect(page).toHaveURL(/#\/(play|morning)/, { timeout: 15000 })
  expect(errors).toEqual([])
})

test('O3 an empty name shakes the field and says so; Play never greys out', async ({ page }) => {
  await brandNew(page)
  const play = page.locator('[data-act="qs-play"]')
  const classBefore = await play.getAttribute('class')
  await expect(page.locator('#name')).toHaveValue('') // (never a fake default to tap straight past)
  await play.tap()
  await expect(page.locator('.en-err')).toHaveText('Type your name to play')
  await expect(page.locator('.qs-name')).toHaveClass(/qs-shake/)
  await expect(play).toHaveAttribute('class', classBefore) // (the same gold button: never disabled or greyed)
  await expect(play).toBeEnabled()
})

test('O4 the name and the handle both pass handle_blocklist.json before Play works', async ({ page }) => {
  await brandNew(page)
  // a reserved word as a name: refused outright, never quietly renamed or let through
  await page.locator('#name').fill('Admin')
  await page.locator('[data-act="qs-play"]').tap()
  await expect(page.locator('.en-err')).toContainText('reserved')
  await expect(page.locator('.qs')).toBeVisible()
  await expect(page).toHaveURL(/#\/new/)
  // an ordinary name: Play works, and the handle it lands on is never one of the blocklist's words
  await page.locator('#name').fill('Thandiwe Nkosi')
  await page.locator('[data-act="qs-play"]').tap()
  await expect(page).toHaveURL(/#\/(play|morning)/, { timeout: 15000 })
  const s = await save(page)
  const bare = s.run.character.handle.replace(/_/g, '')
  expect(BLOCKLIST.exact).not.toContain(bare)
  expect(BLOCKLIST.reserved.some((w) => bare.includes(w.replace(/_/g, '')))).toBe(false)
})

test('L2 swap roommate at the house door: the roommate introduces themselves, four cards, the pick stays', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await brandNew(page, '&morning=0')
  await page.locator('[data-preset="q-thabo"]').tap()
  await page.locator('#name').fill('Sipho')
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await patchRun(page, { day: 1, phase: 'leisure', minutes: 8 * 60 + 15, morningDone: true, lectureResolved: false, lectureRoute: false, at: 'gate', dropOff: { style: 'suburban', day: 1 }, queue: [] })
  await page.goto('/?fast=1&morning=0&talk=auto&door=hold#/play')
  const world = page.locator('#world')
  await expect(world).toHaveAttribute('data-dropoff', 'walk', { timeout: 120000 })
  await page.locator('.dp-walk').tap()
  await expect(world).toHaveAttribute('data-dropoff', 'door', { timeout: 120000 })
  // Marcus introduces himself, with a small Swap roommate beside Hi
  await expect(page.locator('.dp-line')).toContainText("I'm Marcus", { timeout: 30000 })
  const swap = page.locator('.dp-acts [data-swap]')
  await expect(swap).toHaveText('Swap roommate')
  await shot(page, 'roommate-intro-390')
  await swap.tap()
  const pop = page.locator('.sl-pop')
  await expect(pop).toBeVisible()
  await expect(pop.locator('.lp-roomie')).toHaveCount(4)
  await expect(pop.locator('.lp-roomie b')).toHaveText(['Ethan', 'Marcus', 'Ryan', 'Ravi'])
  await expect(pop.locator('.lp-roomie[aria-pressed="true"]')).toHaveAttribute('data-roommate', 'marcus')
  await shot(page, 'roommate-swap-390')
  await pop.locator('[data-roommate="ravi"]').tap()
  await expect(pop).toHaveCount(0)
  await expect(page.locator('.dp-line')).toContainText("I'm Ravi", { timeout: 10000 })
  await page.locator('.dp-acts button').first().tap()
  await expect(world).toHaveAttribute('data-dropoff', 'done', { timeout: 30000 })
  // the pick is kept (applied when the drop-off is over, so the campus is not rebuilt under the scene)
  await expect.poll(async () => (await save(page)).run.character.roommate, { timeout: 15000 }).toBe('ravi')
  expect((await save(page)).run.bestieName).toBe('Ravi')
  expect((await save(page)).run.pendingRoommate).toBeUndefined()
  expect(errors).toEqual([])
})

// ---------- L3 the card prompt ----------
const pop = (page) => page.locator('.sl-pop')
async function mealAt(page) {
  // a real meal: the place sheet's Cafeteria meal, played as its scene (queue, order, sit, eat)
  await patchRun(page, { phase: 'social', minutes: 13 * 60, day: 4, doneToday: [], slotsLeft: 5, queue: [] })
  await page.goto('/?fast=1&morning=0&spawn=cafeteria&talk=auto#/place/cafeteria')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  const btn = page.locator('[data-act="do"][data-id="cafeteria_meal"]')
  await expect(btn).toBeVisible({ timeout: 20000 })
  await btn.tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 120000 })
}

test('L3 the card prompt: after the first meal, R200 once, at most once a day', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await onCampus(page, { name: 'Lerato' })
  const s0 = await save(page)
  expect(s0.run.quick).toBe(true)
  // nothing yet: no meal, no gig, nobody has tapped them
  await page.waitForTimeout(3500)
  await expect(pop(page)).toHaveCount(0)
  await mealAt(page)
  // the result card first (a card in the way is never talked over), then, at a calm moment, the prompt
  // (the result card closes by itself after a few seconds; a goal card, if one follows, is closed like a player would)
  for (let i = 0; i < 6; i++) {
    const card = page.locator('aside.g-result')
    if (!(await card.first().isVisible().catch(() => false))) { await page.waitForTimeout(1500); if (!(await card.first().isVisible().catch(() => false))) break }
    const btn = card.locator('button:visible').first()
    if (await btn.isVisible().catch(() => false)) await btn.tap().catch(() => {})
    else await page.waitForTimeout(2500)
  }
  await expect(pop(page), `calm? ${await page.evaluate(() => window.mzansiLaunch.why())}`).toBeVisible({ timeout: 60000 })
  await expect(pop(page)).toContainText('Finish your student card so people know you, and get R200')
  await shot(page, 'card-prompt-390')
  expect((await save(page)).run.cardAsked).toBeTruthy()
  // "Later" closes it, and it does not come back today (a second meal's trigger is held until tomorrow)
  await pop(page).locator('[data-lp="card-later"]').tap()
  await expect(pop(page)).toHaveCount(0)
  await page.evaluate(() => window.mzansiLaunch.want('meal'))
  await page.waitForTimeout(3500)
  await expect(pop(page)).toHaveCount(0)
  // tomorrow (a new day on this phone) it asks again
  await patchRun(page, { cardAsked: '2000-01-01' })
  await page.goto('/?fast=1&morning=0#/play') // (the next visit: a card started but not done is asked again at the first calm moment)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect(pop(page)).toBeVisible({ timeout: 60000 })
  // Finish it: the full steps (look, roommate, who, vibe, card), then Save: R200 and the badge, once
  await pop(page).locator('[data-lp="card-now"]').tap()
  await page.locator('.en[data-step="look"]').waitFor()
  for (const step of ['roommate', 'who', 'vibe', 'card']) {
    await page.locator('[data-act="enrol-next"]').tap()
    await page.locator(`.en[data-step="${step}"]`).waitFor()
  }
  const beforeCard = (await save(page)).run.stats.money
  await page.locator('[data-act="enrol-enter"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await expect.poll(async () => (await save(page)).run.cardDone, { timeout: 15000 }).toBe(true)
  const s1 = await save(page)
  expect(s1.run.stats.money).toBe(beforeCard + 200)
  expect(s1.run.badges).toContain('card_made')
  expect(s1.run.cardPaid).toBe(true)
  const paid = s1.run.stats.money
  // editing the card again pays nothing more, and it is never asked for again
  await page.evaluate(() => window.mzansiLaunch.want('meal'))
  await page.waitForTimeout(3000)
  await expect(pop(page)).toHaveCount(0)
  expect((await save(page)).run.stats.money).toBe(paid)
  // the funnel, each step once per phone, in the order it happened (the page was reloaded on the way: read what the phone kept)
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.funnel')))
  expect(Object.entries(done).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(['play_tapped', 'first_activity', 'card_started', 'card_finished'])
  expect(errors).toEqual([])
})

// ---------- L4 the leaderboard ----------
const ROWS = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, name: ['Naledi', 'Emma', 'Priya', 'Thabo', 'Sam', 'Amy', 'Dev', 'Jason', 'Zoe', 'Ravi'][i], handle: `h${i}`, house: 'Wave House', points: 100 - i * 7, you: false }))
async function mockBoard(page, seen = []) {
  await page.route('**/rest/v1/rpc/score_board', (route) => {
    const body = route.request().postDataJSON()
    seen.push(body.p_board)
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ week: '2026-11-09', top: ROWS.map((r) => ({ ...r, points: r.points + (body.p_board === 'sport' ? 3 : 0) })), you: { rank: 12, points: 30 } }) })
  })
  await page.route('**/rest/v1/rpc/my_badges', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ week: '2026-11-16', board: 'sport', rank: 2 }]) }))
}

test('L4 the leaderboard: a returning player gets the card, a new one does not; three tabs, top 10, You: #N', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const seen = []
  const posted = []
  await mockBoard(page, seen)
  await page.route('**/rest/v1/rpc/record_activity', (route) => { posted.push(route.request().postDataJSON()); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, scored: true, points: 10 }) }) })
  const q = '&scores=1'
  await onCampus(page, { query: q, name: 'Lerato' })
  // their first session: no leaderboard card by itself, however long they stand there
  await page.waitForTimeout(5000)
  await expect(pop(page)).toHaveCount(0)
  expect(seen).toEqual([])
  // ... but the menu has it
  await page.locator('[data-act="gear"]').tap()
  await expect(page.locator('[data-act="lp-board"]')).toBeVisible()
  await visit(page, `/?fast=1&morning=0${q}#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await page.waitForTimeout(3500)
  await expect(pop(page)).toHaveCount(0) // (still the same session: they came back within half an hour)
  // the next time they come back (hours later) it is their second session: the card shows, once a day
  await visit(page, `/?fast=1&morning=0${q}#/play`, { hoursAgo: 3 })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await expect(pop(page)).toBeVisible({ timeout: 60000 })
  await expect(pop(page).locator('.lp-tab')).toHaveText(['Academics', 'Social', 'Sport'])
  await expect(pop(page).locator('.lp-list li')).toHaveCount(10)
  await expect(pop(page).locator('[data-you]')).toHaveText('You: #12 · 30 points')
  await expect(pop(page)).toContainText('resets in')
  expect(seen[0]).toBe('academics')
  await shot(page, 'leaderboard-390')
  await pop(page).locator('[data-board="sport"]').tap()
  await expect(pop(page).locator('.lp-tab[aria-selected="true"]')).toHaveText('Sport')
  await expect(pop(page).locator('.lp-list li').first()).toContainText('103')
  expect(seen).toContain('sport')
  await pop(page).locator('[data-lp="board-close"]').tap()
  await expect(pop(page)).toHaveCount(0)
  // once a day: the same day, another visit, no card
  await visit(page, `/?fast=1&morning=0${q}#/play`, { hoursAgo: 3 })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await page.waitForTimeout(4000)
  await expect(pop(page)).toHaveCount(0)
  // the badge from a past week joins the card: "Week 1 Top 3, Sport"
  await expect.poll(async () => (await save(page)).run.badges, { timeout: 15000 }).toContain('Week 1 Top 3, Sport')
  // every finished activity was sent to Supabase through record_activity
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-said')))
  await expect.poll(() => posted.length, { timeout: 20000 }).toBeGreaterThan(0)
  expect(posted[0]).toMatchObject({ p_activity: 'player_say', p_category: 'social' })
  expect(posted[0].p_secret.length).toBeGreaterThan(15)
  expect(errors).toEqual([])
})

test('L4b the menu opens the board, and the board says so when the server block is not in yet', async ({ page }) => {
  await page.route('**/rest/v1/rpc/score_board', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.score_board(p_board, p_id) in the schema cache' }) }))
  await onCampus(page, { query: '&scores=1', name: 'Lerato' })
  await page.locator('[data-act="gear"]').tap()
  await page.locator('[data-act="lp-board"]').tap()
  await expect(pop(page)).toBeVisible()
  await expect(pop(page)).toContainText('open soon')
  await shot(page, 'leaderboard-soon-390')
})

// ---------- L5 launch safety ----------
test('L5a errors: at most 20 an hour from a phone, each with the player, build and device; funnel rows reach the table', async ({ page }) => {
  const rows = []
  await page.route('**/rest/v1/client_errors*', (route) => {
    if (route.request().method() === 'POST') rows.push(route.request().postDataJSON())
    route.fulfill({ status: 201, body: '' })
  })
  await brandNew(page, '&errlog=1&funnel=1')
  await page.waitForTimeout(800)
  await page.evaluate(() => { for (let i = 0; i < 26; i++) setTimeout(() => { throw new Error(`boom ${i}`) }, i * 15) })
  await page.evaluate(() => { for (let i = 0; i < 3; i++) Promise.reject(new Error(`rejected ${i}`)) })
  await page.waitForTimeout(3500)
  const errs = rows.filter((r) => r.kind === 'error' || r.kind === 'promise')
  expect(errs.length).toBe(20)
  expect(errs.some((r) => r.kind === 'promise')).toBe(true) // (an unhandled rejection is logged too)
  expect(errs[0]).toMatchObject({ kind: 'error' })
  expect(errs[0].build).toBeTruthy()
  expect(errs[0].device).toContain('390x')
  expect(errs[0].player.length).toBeGreaterThan(8)
  expect(errs[0].screen).toBe('#/new')
  // the funnel: link opened (the same table, kind funnel)
  const funnel = rows.filter((r) => r.kind === 'funnel')
  expect([...new Set(funnel.map((r) => r.message))]).toEqual(['link_opened']) // (the test clears the tab's memory and reloads: one more link_opened)
  await page.locator('#name').fill('Lerato')
  await page.locator('[data-act="qs-play"]').tap()
  await expect.poll(() => [...new Set(rows.filter((r) => r.kind === 'funnel').map((r) => r.message))], { timeout: 20000 }).toEqual(['link_opened', 'play_tapped'])
  expect(rows.filter((r) => r.kind === 'funnel').pop().message).toBe('play_tapped')
})


test('L5b #/health: build, commit, Supabase reachable, rooms and players online', async ({ page }) => {
  await page.goto('/?fast=1#/health')
  await expect(page.locator('[data-hl="build"] dd')).not.toHaveText('')
  await expect(page.locator('[data-hl="commit"] dd')).not.toHaveText('')
  await expect(page.locator('[data-hl="supabase"] [data-ok]')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-hl="supabase"] [data-ok]')).toHaveAttribute('data-ok', 'yes')
  await expect(page.locator('[data-hl="online"] [data-hl-players]')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-hl="at"] dd')).not.toHaveText(/checking/)
  await shot(page, 'health-390')
})

test('L5c feedback: the menu button, and one "How is it going?" on the third session', async ({ page }) => {
  await onCampus(page, { name: 'Lerato' })
  await page.locator('[data-act="gear"]').tap()
  await page.locator('[data-act="lp-feedback"]').tap()
  await expect(pop(page)).toContainText('Tell us what you think')
  await pop(page).locator('[data-lp="star-4"]').tap()
  await expect(pop(page).locator('.lp-star[aria-pressed="true"]')).toHaveCount(4)
  await pop(page).locator('#lp-fb').fill('Lekker game, the Caf queue is slow')
  await shot(page, 'feedback-390')
  await pop(page).locator('[data-lp="fb-send"]').tap()
  await expect(pop(page)).toHaveCount(0)
  const sent = await page.evaluate(() => window.__feedback)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toMatchObject({ stars: 4, message: 'Lekker game, the Caf queue is slow', kind: 'menu' })
  // the third session: the pop-up asks once (sessions are 30 minutes apart)
  const back = async (n) => {
    await page.evaluate(() => localStorage.removeItem('mzansiville.fbasked'))
    await visit(page, '/?fast=1&morning=0&fbwait=1#/play', { sessions: n, hoursAgo: 3 })
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  }
  await back(1) // (this visit is the second)
  await page.waitForTimeout(3500)
  await expect(pop(page).locator('#lp-fb')).toHaveCount(0)
  await back(2) // (this visit is the third)
  // (the leaderboard card of the day may come first; close it)
  await expect(pop(page)).toBeVisible({ timeout: 60000 })
  if (await pop(page).locator('[data-lp="board-close"]').isVisible().catch(() => false)) await pop(page).locator('[data-lp="board-close"]').tap()
  await expect(pop(page).locator('#lp-fb')).toBeVisible({ timeout: 60000 })
  await expect(pop(page)).toContainText('How’s it going?')
  await shot(page, 'feedback-session3-390')
  await pop(page).locator('[data-lp="fb-skip"]').tap()
  // asked once only: the next visit (a fourth session) does not ask
  await back(3)
  await page.waitForTimeout(3500)
  await expect(pop(page).locator('#lp-fb')).toHaveCount(0)
})
