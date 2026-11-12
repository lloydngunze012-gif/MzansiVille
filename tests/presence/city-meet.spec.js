// Meeting people (owner, 10 Nov), the two-phone parts, in SunnyBay. Two real players
// (their own browser context each, a test room of their own, real Supabase Realtime).
// Item 1: B taps A and the mini card opens. Item 2: Wave reaches A with a "Wave back"
// toast. Item 6: Race to the pier -- invite, accept, the 3-2-1, and a result on both
// phones. Item 3: two players sent to the same taxi stop a moment apart land on
// different spots, never on top of each other.
// Run: npx playwright test tests/presence/city-meet.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { atGate, intoCity } from '../city.js'

const ROOM = `test-meet-${Date.now().toString(36)}`
test.setTimeout(300000)

async function phone(browser, name) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await atGate(page, { query: `&room=${ROOM}` })
  return { ctx, page, name }
}
const others = (page) => page.evaluate(() => window.mzansiCity.others())
const info = (page) => page.evaluate(() => window.mzansiCity.info())
// B taps wherever A is drawn on B's own screen.
async function tapOther(b, a) {
  const mine = (await others(b.page))[0]
  if (!mine) return false
  const p = await b.page.evaluate(([x, z]) => window.mzansiCity.px(x, 0, z), [mine.x, mine.z])
  await b.page.touchscreen.tap(p.x, p.y)
  return true
}

test('two phones in SunnyBay: the mini card, Wave, Race to the pier, and the ring of spots', async ({ browser }) => {
  const a = await phone(browser, 'A')
  const b = await phone(browser, 'B')
  for (const p of [a, b]) await intoCity(p.page)
  for (const [p, [x, z]] of [[a, [0, 190]], [b, [4, 192]]]) await p.page.evaluate(([px, pz]) => window.mzansiCity.teleport(px, pz, 0), [x, z])
  await expect.poll(async () => (await others(a.page)).length, { timeout: 40000 }).toBe(1)
  await expect.poll(async () => (await others(b.page)).length, { timeout: 40000 }).toBe(1)

  // Item 1: B taps A; the mini card opens (never a dialog: B can still walk).
  let opened = false
  for (let i = 0; i < 6 && !opened; i++) {
    await tapOther(b, a)
    await b.page.waitForTimeout(900)
    opened = await b.page.locator('.pc-mini-body .pc-mini-name').isVisible().catch(() => false)
  }
  await expect(b.page.locator('.pc-mini-body .pc-mini-name')).toBeVisible({ timeout: 5000 })
  await b.page.screenshot({ path: 'docs/sprints/meeting/mini-card-city-390.png' })

  // (job I, 12 Nov: no Wave on the card any more: Chat and Follow, the rest in ⋯)
  await expect(b.page.locator('[data-pc="wave"]')).toHaveCount(0)
  // Item 6: Race to the pier, from the card's ⋯ menu in the city. B invites A.
  await b.page.locator('[data-pc="more"]').tap()
  await b.page.locator('[data-pc="race"]').tap()
  await expect(a.page.locator('.tg-invite')).toBeVisible({ timeout: 10000 })
  await a.page.screenshot({ path: 'docs/sprints/meeting/race-invite-390.png' })
  await a.page.locator('.tg-invite [data-tg="accept"]').tap()
  await expect(a.page.locator('.tg-count')).toBeVisible({ timeout: 5000 })
  await expect(b.page.locator('.tg-count')).toBeVisible({ timeout: 8000 })
  await a.page.screenshot({ path: 'docs/sprints/meeting/race-countdown-390.png' })
  await a.page.waitForTimeout(3200) // the 3-2-1 and "GO!"
  // Both run to the pier (teleported here, so the result is quick and deterministic).
  // Touching down there crosses into Beachfront, which can delay the finish poke a
  // moment (a district room switch): the result settles within a few retries.
  await a.page.evaluate(() => window.mzansiCity.teleport(291, 0, 0))
  await b.page.evaluate(() => window.mzansiCity.teleport(292, 1, 0))
  await expect.poll(async () => a.page.locator('.tg-result').textContent(), { timeout: 20000 }).toMatch(/win/i)
  await expect.poll(async () => b.page.locator('.tg-result').textContent(), { timeout: 20000 }).toMatch(/win/i)
  const resultA = await a.page.locator('.tg-result').textContent()
  const resultB = await b.page.locator('.tg-result').textContent()
  await a.page.screenshot({ path: 'docs/sprints/meeting/race-result-390.png' })
  console.log('race result', JSON.stringify({ resultA, resultB }))
  await a.page.locator('.tg-result [data-tg="close"]').tap()
  await b.page.locator('.tg-result [data-tg="close"]').tap()

  // Item 3: the ring of spots. A arrives at the Town centre taxi stop first; once B's
  // phone knows that (the same way a taxi ride or the map's "walk there" arrives),
  // sending B to the very same point lands on a different spot, never on top of A.
  // (the race left both of them in Beachfront: back to Town, in the same room, first)
  await a.page.evaluate(() => window.mzansiCity.teleport(-16, 222.5, 0))
  await b.page.evaluate(() => window.mzansiCity.teleport(-80, 190, 0))
  await expect.poll(async () => {
    const o = (await others(b.page))[0]
    return o ? Math.hypot(o.x - -16, o.z - 222.5) : 999
  }, { timeout: 20000 }).toBeLessThan(2)
  await b.page.evaluate(() => window.mzansiCity.teleport(-16, 222.5, 0))
  await b.page.waitForTimeout(400)
  const posA = (await info(a.page)).player
  const posB = (await info(b.page)).player
  console.log('ring of spots', JSON.stringify({ posA, posB }))
  expect(Math.hypot(posA[0] - posB[0], posA[1] - posB[1]), 'B did not land on top of A').toBeGreaterThan(0.5)

  for (const p of [a, b]) await p.ctx.close()
})
