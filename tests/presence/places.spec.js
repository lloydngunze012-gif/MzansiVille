// City job B, the two-phone part: two real players (their own browser context each, a test room of their own,
// real Supabase Realtime) walk into Lifecup. They see each other inside; the mini card and Wave work there and the
// Race is not offered indoors; a "Better with friends here" row pays the full Social while the other is in the
// place, and half once you are alone.
// Run: npx playwright test tests/presence/places.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import { atGate, city, closeResult, leavePlace, pickRow, placeNow, run, toDoor } from '../city.js'

const ROOM = `test-places-${Date.now().toString(36)}`
test.setTimeout(300000)

async function phone(browser, name) {
  const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await atGate(page, { query: `&room=${ROOM}`, patch: { cityAt: { x: 20, z: 212 }, phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 5, stats: { money: 500, energy: 90, grades: 50, social: 30, hunger: 40 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  return { ctx, page, name }
}
const others = (page) => page.evaluate(() => window.mzansiCity.others())

test('two phones in Lifecup: they see each other, the mini card and Wave work, friends rows pay full Social; alone, half', async ({ browser }) => {
  const a = await phone(browser, 'A')
  const b = await phone(browser, 'B')
  await toDoor(a.page, 'lifecup')
  await toDoor(b.page, 'lifecup')
  for (const p of [a, b]) await p.page.locator('.city-todo [data-city="todo-close"]').tap()
  // A walks over to the counter; B stays by the door
  const focus = (await placeNow(a.page)).room.focus
  await a.page.evaluate(([x, z]) => window.mzansiCity.walkTo(x - 1.5, z + 0.5), [focus.x, focus.z])
  await expect.poll(async () => { const i = await a.page.evaluate(() => window.mzansiCity.info()); return Math.hypot(i.player[0] - focus.x + 1.5, i.player[1] - focus.z - 0.5) }, { timeout: 30000 }).toBeLessThan(1)
  // inside, each sees the other (and nobody on the street does: they are in the room, not at the door)
  await expect.poll(async () => (await others(a.page)).length, { timeout: 40000 }).toBe(1)
  await expect.poll(async () => (await others(b.page)).length, { timeout: 40000 }).toBe(1)
  await expect.poll(async () => (await placeNow(a.page)).friends, { timeout: 20000 }).toBe(1)
  await a.page.screenshot({ path: 'docs/sprints/places/two-in-lifecup-390.png' })

  // the mini card and Wave, indoors; no Race in here
  let opened = false
  for (let i = 0; i < 6 && !opened; i++) {
    const mine = (await others(b.page))[0]
    const px = await b.page.evaluate(([x, z]) => window.mzansiCity.px(x, 0.9, z), [mine.x, mine.z])
    await b.page.touchscreen.tap(px.x, px.y)
    await b.page.waitForTimeout(900)
    opened = await b.page.locator('.pc-mini-body .pc-mini-name').isVisible().catch(() => false)
  }
  await expect(b.page.locator('.pc-mini-body .pc-mini-name')).toBeVisible({ timeout: 5000 })
  await expect(b.page.locator('[data-pc="race"]')).toHaveCount(0)
  await expect(b.page.locator('[data-pc="wave"]')).toHaveCount(0) // (job I: Chat and Follow only)
  await b.page.locator('.pc-mini-x').tap()

  // a friends row with B in the place: the full Social
  await a.page.locator('.city-do').tap()
  const slow = a.page.locator('.ct-row[data-row="lifecup_have_a_slow_coffee_with_someone"]')
  await expect(slow.locator('.tag.with')).toBeVisible()
  await expect(slow.locator('.ct-fx')).toContainText('+11 Social')
  let before = await run(a.page)
  await pickRow(a.page, 'lifecup_have_a_slow_coffee_with_someone')
  let after = await run(a.page)
  expect(after.stats.social - before.stats.social).toBe(11)
  await expect(a.page.locator('.city-result')).not.toContainText('half the Social')
  await closeResult(a.page)

  // B leaves; alone, the same kind of row pays half (rounded down) and says so
  await leavePlace(b.page)
  await b.page.evaluate(() => window.mzansiCity.teleport(20, 240, 0))
  await expect.poll(async () => (await placeNow(a.page)).friends, { timeout: 30000 }).toBe(0)
  await a.page.locator('.city-todo [data-city="todo-close"]').tap()
  await a.page.locator('.city-do').tap()
  const table = a.page.locator('.ct-row[data-row="lifecup_join_the_big_table_upstairs"]')
  await expect(table.locator('.tag.alone')).toBeVisible()
  await expect(table.locator('.ct-fx')).toContainText('+6 Social')
  before = await run(a.page)
  await pickRow(a.page, 'lifecup_join_the_big_table_upstairs')
  after = await run(a.page)
  expect(after.stats.social - before.stats.social).toBe(6)
  await expect(a.page.locator('.city-result')).toContainText('half the Social')
  await a.page.screenshot({ path: 'docs/sprints/places/alone-half-social-390.png' })
  await a.ctx.close()
  await b.ctx.close()
})
