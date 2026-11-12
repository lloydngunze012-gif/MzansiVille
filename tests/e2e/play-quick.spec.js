// Job K (owner, 12 Nov): activities you play. In the quick project, real GPU.
//   K1 Bowling: walk to your lane, drag to aim, release; the ball rolls, pins fall, two balls, a score on the card;
//      NPCs bowl on the other lanes; a SHOES sign over the desk. The racing cabinet: 20 s, tap to change lane.
//   K2 The library's focus moment (tap on the beat) sets the Grades gain; a gym set sets the Energy cost and gain.
//   K3 The beach: a kick-about with the people there (tap the ball, tap to kick) and the swim to the buoy;
//      an ordinary row: your student visibly does it, with its own sound.
//   K4 Campus: the library's study is a focus moment; the Caf meal: a tray carried to the table, eaten there.
// Screenshots at 390 px (not committed): docs/sprints/play/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, city, closeResult, run, toDoor } from '../city.js'

const OUT = 'docs/sprints/play'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(300000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
const shot = async (page, name) => { await page.waitForTimeout(300); try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }) } catch (e) { console.log(`screenshot ${name} skipped: ${String(e.message).split('\n')[0]}`) } }
const mini = (page) => page.evaluate(() => window.mzansiMini())
const played = (page) => page.evaluate(() => window.mzansiCity.play())
const RICH = { phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 9, stats: { money: 3000, energy: 95, grades: 50, social: 30, hunger: 70 } }
async function pick(page, rowId) {
  const row = page.locator(`.city-todo .ct-row[data-row="${rowId}"]`)
  await row.scrollIntoViewIfNeeded()
  await row.tap()
}
async function canvasBox(page) { return page.locator('.mg canvas').boundingBox() }
// Tap the game's canvas whenever the game says a tap is due, until it ends.
async function tapOnBeat(page, max = 40) {
  const b = await canvasBox(page)
  for (let i = 0; i < 400 && (await mini(page))?.phase === 'play'; i++) {
    const m = await mini(page)
    if (m?.due) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150) } else await page.waitForTimeout(25)
    if (i > max * 20) break
  }
}

test('K1 bowling: your lane, drag and release, pins fall, a score; NPCs bowl; the racing cabinet', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...RICH, cityAt: { x: 20, z: 210 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await toDoor(page, 'arcade')
  await expect.poll(async () => (await played(page))?.shoes, { timeout: 10000, message: 'a SHOES sign over the desk' }).toBe(true)
  await expect.poll(async () => (await played(page)).bowlers?.some((b) => b.rolling), { timeout: 20000, message: 'somebody bowls on another lane' }).toBe(true)
  await shot(page, 'k1-hall')
  const before = await run(page)
  await pick(page, 'arcade_learn_the_bowling_approach')
  await expect(page.locator('.mg[data-kind="bowling"]')).toBeVisible({ timeout: 30000 })
  await shot(page, 'k1-lane')
  // two balls: drag up the lane and let go
  for (let ball = 0; ball < 2 && (await mini(page))?.phase === 'play'; ball++) {
    await expect.poll(async () => { const m = await mini(page); return m?.phase !== 'play' || !m.rolling }, { timeout: 15000 }).toBe(true)
    if ((await mini(page))?.phase !== 'play') break
    const b = await canvasBox(page)
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 30)
    await page.mouse.down()
    for (let k = 1; k <= 8; k++) await page.mouse.move(b.x + b.width / 2 + k * 0.6, b.y + b.height - 30 - k * 30)
    await page.mouse.up()
    await expect.poll(async () => (await mini(page))?.rolling || (await mini(page))?.phase === 'end', { timeout: 5000 }).toBe(true)
    if (ball === 0) await shot(page, 'k1-rolling')
    await expect.poll(async () => { const m = await mini(page); return m.phase === 'end' || m.rolls.length > ball }, { timeout: 20000 }).toBe(true)
  }
  await expect.poll(async () => (await mini(page))?.phase, { timeout: 20000 }).toBe('end')
  const res = (await mini(page)).result
  expect(res.pins).toBeGreaterThanOrEqual(1) // (a straight ball down the middle knocks pins over)
  await shot(page, 'k1-score')
  await page.locator('.mg [data-mg="done"]').tap()
  await expect(page.locator('.city-result')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.city-result .cr-note').first()).toContainText('\u{1F3B3}')
  const after = await run(page)
  expect(after.stats.grades).toBeGreaterThan(before.stats.grades) // (the row itself still pays: +3 Grades)
  await closeResult(page)
  // the racing cabinet: tap to change lanes; 20 seconds; a place
  await pick(page, 'arcade_play_one_racing_cabinet')
  await expect(page.locator('.mg[data-kind="race"]')).toBeVisible({ timeout: 30000 })
  const b = await canvasBox(page)
  for (let i = 0; i < 6; i++) { await page.touchscreen.tap(b.x + (i % 2 ? b.width * 0.8 : b.width * 0.2), b.y + b.height / 2); await page.waitForTimeout(600) }
  const lane = (await mini(page)).lane
  expect([0, 1, 2]).toContain(lane)
  await shot(page, 'k1-race')
  await expect.poll(async () => (await mini(page))?.phase, { timeout: 30000 }).toBe('end')
  expect((await mini(page)).result.place).toBeGreaterThanOrEqual(1)
  await page.locator('.mg [data-mg="done"]').tap()
  await expect(page.locator('.city-result .cr-note').first()).toContainText('of 6')
  expect((await played(page)).log.map((l) => l.kind)).toEqual(['bowling', 'race'])
  expect(errors).toEqual([])
})

test('K2 the library focus sets the Grades; a gym set sets the Energy cost and the gain', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...RICH, cityAt: { x: 20, z: 210 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await toDoor(page, 'city_library')
  let before = await run(page)
  await pick(page, 'city_library_read_a_chapter_by_the_window')
  await expect(page.locator('.mg[data-kind="focus"]')).toBeVisible({ timeout: 30000 })
  await shot(page, 'k2-focus')
  await tapOnBeat(page)
  await expect.poll(async () => (await mini(page))?.phase, { timeout: 20000 }).toBe('end')
  const focus = (await mini(page)).result
  expect(focus.perfect + focus.good).toBeGreaterThanOrEqual(2) // (taps land; how many depends on the machine's load, the rule below uses the real score)
  await page.locator('.mg [data-mg="done"]').tap()
  await expect(page.locator('.city-result')).toBeVisible({ timeout: 20000 })
  let after = await run(page)
  const want = Math.max(1, Math.round(4 * (0.5 + focus.score)))
  expect(Math.round(after.stats.grades - before.stats.grades)).toBe(want) // (the row's +4, by how well you read)
  await closeResult(page)
  await page.locator('.city-todo [data-city="todo-close"]').tap()
  await page.locator('.city-leave').tap()
  await expect(city(page)).toHaveAttribute('data-place', '', { timeout: 20000 })
  // the gym: a set; skipping it is a middling set (the Energy cost x1.05, the gain x0.9)
  await toDoor(page, 'gym')
  before = await run(page)
  await pick(page, 'gym_learn_the_squat')
  await expect(page.locator('.mg[data-kind="reps"]')).toBeVisible({ timeout: 30000 })
  await shot(page, 'k2-reps')
  await tapOnBeat(page)
  await expect.poll(async () => (await mini(page))?.phase, { timeout: 20000 }).toBe('end')
  const set = (await mini(page)).result
  expect(set.good).toBeGreaterThanOrEqual(2) // (as above)
  await page.locator('.mg [data-mg="done"]').tap()
  await expect(page.locator('.city-result')).toBeVisible({ timeout: 20000 })
  after = await run(page)
  const q = set.score
  expect(Math.round(after.stats.energy - before.stats.energy)).toBe(Math.round(-8 * (1.3 - 0.5 * q)))
  expect(Math.round(after.stats.grades - before.stats.grades)).toBe(Math.max(1, Math.round(2 * (0.6 + 0.6 * q))))
  expect(errors).toEqual([])
})

test('K3 the beach: a kick-about and the swim; an ordinary row is seen being done, with its sound', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...RICH, cityAt: { x: 20, z: 210 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  // an ordinary row: Lifecup's muffin: eating, the crunch
  await toDoor(page, 'lifecup')
  await pick(page, 'lifecup_eat_a_muffin')
  await expect(page.locator('.city-doing')).toBeVisible({ timeout: 10000 })
  await shot(page, 'k3-muffin')
  await expect(page.locator('.city-result')).toBeVisible({ timeout: 20000 })
  expect((await played(page)).log.at(-1)).toMatchObject({ row: 'lifecup_eat_a_muffin', kind: 'eat', sound: 'crunch' })
  await closeResult(page)
  await page.locator('.city-todo [data-city="todo-close"]').tap()
  await page.locator('.city-leave').tap()
  await expect(city(page)).toHaveAttribute('data-place', '', { timeout: 20000 })
  // the beach: the ball on the sand
  await page.evaluate(() => { const l = window.mzansiCity.plan.LOTS.find((x) => x.id === 'beach'); window.mzansiCity.teleport(l.door.x + 9, l.door.z + 1.5, Math.PI / 2) })
  await expect.poll(async () => (await played(page))?.ball, { timeout: 20000 }).toBeTruthy()
  const ball = (await played(page)).ball
  const at = await page.evaluate(([x, z]) => window.mzansiCity.px(x, 0.16, z), [ball.x, ball.z])
  await page.touchscreen.tap(at.x, at.y)
  await expect.poll(async () => (await played(page))?.kick, { timeout: 10000, message: 'the kick-about started' }).toBeTruthy()
  await shot(page, 'k3-kickabout')
  for (let i = 0; i < 600 && (await played(page)).kick; i++) {
    if ((await played(page)).kick?.due) { await page.touchscreen.tap(195, 500); await page.waitForTimeout(200) } else await page.waitForTimeout(30)
  }
  const kick = (await played(page)).log.find((l) => l.kind === 'kickabout')
  expect(kick.score).toBeGreaterThan(0)
  // the swim
  await toDoor(page, 'beach')
  const was = (await run(page)).stats.energy
  await pick(page, 'beach_swim_to_the_near_buoy')
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCity.info())).player[0], { timeout: 30000, message: 'swimming out' }).toBeGreaterThan(295)
  await shot(page, 'k3-swim')
  await expect(page.locator('.city-result')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('.city-result .cr-note').first()).toContainText('buoy')
  expect((await run(page)).stats.energy).toBeLessThan(was)
  expect(errors).toEqual([])
})

test('K4 campus: the library study is a focus moment; the Caf meal is a tray carried to a table and eaten there', async ({ page }) => {
  const errors = await atGate(page, { patch: RICH })
  const before = await run(page)
  await page.evaluate(() => { location.hash = '#/place/library' })
  const row = page.locator('.g-sheet [data-act="do"][data-id="lib_group"]')
  await expect(row).toBeVisible({ timeout: 20000 })
  await row.tap()
  await expect(page.locator('.mg[data-kind="focus"]')).toBeVisible({ timeout: 20000 })
  await tapOnBeat(page)
  await expect.poll(async () => (await mini(page))?.phase, { timeout: 20000 }).toBe('end')
  const focus = (await mini(page)).result
  await page.locator('.mg [data-mg="done"]').tap()
  await expect.poll(async () => Math.round((await run(page)).stats.grades - before.stats.grades), { timeout: 60000 }).toBeGreaterThan(0)
  const gain = Math.round((await run(page)).stats.grades - before.stats.grades)
  // (the game's own rules shape the +3 first: halved when falling behind, doubled in exam week; then the score)
  expect(gain, `focus ${focus.score}`).toBeGreaterThanOrEqual(1)
  expect(gain).toBeLessThanOrEqual(Math.round(3 * 2 * (0.5 + focus.score)) + 1)
  await shot(page, 'k4-library-result')
  // the Caf meal: Mama Liz's menu (the queue itself is tested in actions.spec), a tray to carry, the table, eating
  await page.evaluate(() => { location.hash = '#/play' })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // (asked until her menu is up: the library scene may still be walking you out of the room)
  const item = page.locator('[data-act="talk-item"][data-item="pap"]')
  await expect.poll(async () => { if (await item.isVisible().catch(() => false)) return true; await page.evaluate(() => { window.mzansiVendorReady = 'mama_liz'; window.mzansiTalkTo('mama_liz') }); await page.waitForTimeout(2500); return item.isVisible().catch(() => false) }, { timeout: 90000 }).toBe(true)
  await item.tap()
  await page.locator('[data-act="talk-eat"][data-how="sit"]').tap()
  await expect.poll(async () => (await page.evaluate(() => window.mzansiHeld())).held, { timeout: 20000, message: 'the tray is in your hand' }).toBe('held-tray')
  await shot(page, 'k4-tray')
  // (eating and seated, read in one go: at the tests' tenfold speed the meal is over in a moment)
  await expect.poll(async () => { const h = await page.evaluate(() => window.mzansiHeld()); return h.eating && h.pose === 'sit' }, { timeout: 60000, message: 'eating, seated at the table' }).toBe(true)
  await shot(page, 'k4-eating')
  await expect.poll(async () => (await page.evaluate(() => window.mzansiHeld())).eating, { timeout: 60000 }).toBe(false)
  expect(errors).toEqual([])
})
