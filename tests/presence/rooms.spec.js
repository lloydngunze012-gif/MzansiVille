// Rooms hold at most 40 players (owner, 9 Nov); the 41st lands in a new room. Forty browsers on one PC is not
// a test anyone can run, so the cap is lowered with ?roomcap=2: the third player lands in "<room>-2", sees
// nobody from room 1, and the two in room 1 never see the third. Each phone is its own browser context (its
// own identity). Real Supabase Realtime, a test room of its own (nobody on the live campus sees it).
// Also: a tapped player is told ('look'), which is what asks a quick-start student to finish their card.
// Run: npx playwright test tests/presence/rooms.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'

const ROOM = `test-rooms-${Date.now().toString(36)}`
test.setTimeout(240000)
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const url = `/?fast=1&enrol=quick&morning=0&room=${ROOM}&roomcap=2#/new`
  await page.goto(`http://127.0.0.1:5173${url}`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`http://127.0.0.1:5173${url}`)
  await page.locator('#name').fill(name)
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, resMorningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto(`http://127.0.0.1:5173/?fast=1&morning=0&room=${ROOM}&roomcap=2#/play`)
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  return { ctx, page }
}
const info = (page) => page.evaluate(() => window.mzansiPresence())

test('a third player, with a room cap of two, lands in the next room', async ({ browser }) => {
  const a = await phone(browser, 'Ayanda')
  await expect.poll(async () => (await info(a.page)).live, { timeout: 30000 }).toBe(true)
  expect((await info(a.page)).room).toBe(ROOM)
  const b = await phone(browser, 'Bonga')
  await expect.poll(async () => (await info(b.page)).live, { timeout: 30000 }).toBe(true)
  expect((await info(b.page)).room).toBe(ROOM)
  await expect.poll(async () => (await info(a.page)).count, { timeout: 30000 }).toBe(2)
  const c = await phone(browser, 'Carla')
  // the first two are in the room, the third is sent on to the next one
  await expect.poll(async () => (await info(c.page)).room, { timeout: 30000 }).toBe(`${ROOM}-2`)
  await expect.poll(async () => (await info(c.page)).live, { timeout: 30000 }).toBe(true)
  expect((await info(c.page)).cap).toBe(2)
  // nobody in room 1 sees Carla, and she sees nobody from room 1: a campus of her own
  await expect.poll(async () => (await info(c.page)).count, { timeout: 15000 }).toBe(1)
  expect((await info(a.page)).count).toBe(2)
  expect((await info(b.page)).count).toBe(2)
  expect((await info(c.page)).peers).toHaveLength(0)
  // a fourth player joins Carla in room 2
  const d = await phone(browser, 'Dineo')
  await expect.poll(async () => (await info(d.page)).room, { timeout: 30000 }).toBe(`${ROOM}-2`)
  await expect.poll(async () => (await info(c.page)).count, { timeout: 30000 }).toBe(2)
  // a player who leaves frees a place: the next one joins room 1 again
  await a.ctx.close()
  await expect.poll(async () => (await info(b.page)).count, { timeout: 30000 }).toBe(1)
  const e = await phone(browser, 'Eve')
  await expect.poll(async () => (await info(e.page)).room, { timeout: 30000 }).toBe(ROOM)
  for (const p of [b, c, d, e]) await p.ctx.close()
})
