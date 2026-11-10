// Players in the city (City job A): other players are visible in the district you are in. One Realtime room per
// district (the launch job's rooms of 40, per district): two players in Town centre share "<room>.town" and see each
// other; a player on campus is in "<room>" and sees neither; the map shows how many are in each district; a player
// who walks on to another district moves to that district's room. Real Supabase Realtime, a test room of its own.
// Run: npx playwright test tests/presence/city.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { atGate, intoCity } from '../city.js'

const ROOM = `test-city-${Date.now().toString(36)}`
test.setTimeout(300000)

async function phone(browser) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await atGate(page, { query: `&room=${ROOM}` })
  return { ctx, page }
}
const presence = (page) => page.evaluate(() => window.mzansiPresence())
const others = (page) => page.evaluate(() => window.mzansiCity.others())

test('two players in Town centre see each other; a player on campus sees neither; the map counts each district', async ({ browser }) => {
  const a = await phone(browser)
  const b = await phone(browser)
  const c = await phone(browser)
  for (const p of [a, b]) {
    await intoCity(p.page)
    await p.page.evaluate(([x, z]) => window.mzansiCity.teleport(x, z, 0), p === a ? [0, 190] : [3, 194])
  }
  // each is in the district's own room, and they see each other there, name tag and all
  for (const p of [a, b]) await expect.poll(async () => (await presence(p.page)).room, { timeout: 30000 }).toBe(`${ROOM}.town`)
  await expect.poll(async () => (await presence(a.page)).count, { timeout: 40000 }).toBe(2)
  await expect.poll(async () => (await others(a.page)).length, { timeout: 30000 }).toBe(1)
  await expect.poll(async () => (await others(b.page)).length, { timeout: 30000 }).toBe(1)
  const seen = (await others(a.page))[0]
  expect(Math.hypot(seen.x - 3, seen.z - 194)).toBeLessThan(2.5)
  await expect(a.page.locator('[data-online]').first()).toHaveText('2 in Town centre')
  // the one on campus is in the campus room, alone
  expect((await presence(c.page)).room).toBe(ROOM)
  expect((await presence(c.page)).count).toBe(1)
  // ...and the map tells them where everyone is
  await c.page.locator('.minimap').tap()
  await c.page.locator('[data-map="city"]').tap()
  await expect.poll(async () => JSON.parse((await c.page.locator('.cm-overlay').getAttribute('data-counts')) || '{}').town, { timeout: 30000 }).toBe(2)
  await expect(c.page.locator('.cm-names [data-count="town"]')).toHaveText('2 here')
  await c.page.screenshot({ path: 'docs/sprints/city/presence-map-counts.png' })
  // one walks on to the Beachfront: a new room, and Town centre is down to one
  await b.page.evaluate(() => window.mzansiCity.teleport(200, 20, 0))
  await expect.poll(async () => (await presence(b.page)).room, { timeout: 30000 }).toBe(`${ROOM}.beachfront`)
  await expect.poll(async () => (await others(a.page)).length, { timeout: 30000 }).toBe(0)
  await expect.poll(async () => (await presence(a.page)).count, { timeout: 30000 }).toBe(1)
  for (const p of [a, b, c]) await p.ctx.close()
})
