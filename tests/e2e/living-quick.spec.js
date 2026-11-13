// Job J (owner, 12 Nov): a living world. In the quick project.
//   J1 SunnyBay: a crowd on the pavements near you (the district's target), some go into shop doors and come back;
//      the beach: families, kids, sandcastles, swimmers, a ball game, the lifeguard, Cursor's lines over their heads,
//      the foam; the billboards: twelve on the roads with the game's own features and the brands, wall slots with
//      the two empty brand slots.
//   J2 The SunnyBay places: the staff greet you when you come in; patrons sit at the tables.
//   J3 The Caf at lunch: the four staff behind their counters, a queue, people eating; quiet out of meal times.
//   J4 Campus outside: walkers on the paths, groups on the lawns, a football kick-about.
// The frame rate per district (item 8) is tests/basics/living-fps.spec.js, in the timing project.
// Screenshots at 390 px (not committed): docs/sprints/living/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { atGate, city, toDoor } from '../city.js'

const OUT = 'docs/sprints/living'
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 20000 })
test.setTimeout(300000)
test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }))
const shot = async (page, name) => { await page.waitForTimeout(300); try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 30000 }) } catch (e) { console.log(`screenshot ${name} skipped: ${String(e.message).split('\n')[0]}`) } }
const crowd = (page) => page.evaluate(() => window.mzansiCity.crowd())
const LUNCH = { minutes: 12 * 60 + 30, phase: 'social' }

test('J1 SunnyBay: a crowd on the pavements and in and out of shops, the beach full, the billboards', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...LUNCH, cityAt: { x: -16, z: 230 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await expect.poll(async () => (await crowd(page))?.walkers || 0, { timeout: 20000 }).toBeGreaterThanOrEqual(30)
  const c = await crowd(page)
  expect(c.target).toBe(44)
  expect(c.shoppers).toBeGreaterThanOrEqual(5)
  // (at the tests' tenfold speed a shopper's stroll to a door takes a moment)
  await expect.poll(async () => (await crowd(page)).inShops, { timeout: 30000, message: 'somebody went into a shop' }).toBeGreaterThanOrEqual(1)
  await shot(page, 'j1-town')
  // the billboards: twelve on the roads, the wall slots, the game's own features, the empty brand slots
  const boards = await page.evaluate(() => window.mzansiCity.boards())
  expect(boards.filter((b) => !b.wall).length).toBe(12)
  expect(boards.filter((b) => b.wall).length).toBeGreaterThanOrEqual(4)
  expect(boards.some((b) => b.feature)).toBe(true)
  expect(boards.filter((b) => b.empty).length).toBe(2)
  // the beach
  await page.evaluate(() => window.mzansiCity.teleport(280, 30, Math.PI / 2))
  await expect.poll(async () => (await crowd(page)).beach, { timeout: 20000 }).toBeGreaterThanOrEqual(20)
  const roles = (await crowd(page)).roles
  for (const r of ['family', 'kid', 'castle', 'swimmer', 'ball', 'lifeguard']) expect(roles[r] || 0, r).toBeGreaterThanOrEqual(1)
  await expect.poll(async () => (await crowd(page)).said.length, { timeout: 30000, message: 'somebody on the beach called out' }).toBeGreaterThanOrEqual(1)
  const lines = JSON.parse(fs.readFileSync('data/campusville/beach_lines.json', 'utf8'))
  expect([...lines.kids, ...lines.families, ...lines.lifeguard]).toContain((await crowd(page)).said[0])
  expect(await page.evaluate(() => Boolean(document.querySelector('.cb-bubble')))).toBe(true)
  await shot(page, 'j1-beach')
  expect(errors).toEqual([])
})

test('J2 the places: the staff greet you; patrons sit at the tables', async ({ page }) => {
  const errors = await atGate(page, { patch: { ...LUNCH, cityAt: { x: 20, z: 210 } } })
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 120000 })
  await toDoor(page, 'lifecup')
  await expect.poll(() => page.evaluate(() => window.mzansiCity.greetings()), { timeout: 15000 }).toContain('lifecup')
  await page.locator('.city-todo [data-city="todo-close"]').tap()
  await expect.poll(() => page.evaluate(() => window.mzansiCity.sitters()), { timeout: 60000, message: 'a patron sat down at a table' }).toBeGreaterThanOrEqual(1)
  await shot(page, 'j2-lifecup')
  expect(errors).toEqual([])
})

test('J3 the Caf: busy at lunch (staff, a queue, people eating), quiet mid-morning', async ({ page }) => {
  const errors = await atGate(page, { patch: LUNCH })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-enter-caf')))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  const lunch = await page.evaluate(() => window.mzansiCafPeople())
  expect(lunch.busy).toBe(true)
  expect(lunch.staff).toEqual(['mama_liz', 'aunty_premi', 'uncle_jaco', 'kyle'])
  expect(lunch.patrons).toBeGreaterThanOrEqual(8)
  expect(lunch.queue).toBeGreaterThanOrEqual(2)
  expect(lunch.eating).toBeGreaterThanOrEqual(4)
  await expect.poll(async () => (await page.evaluate(() => window.mzansiCafPeople())).served, { timeout: 30000, message: 'somebody was served' }).toBeGreaterThanOrEqual(1)
  await shot(page, 'j3-caf-lunch')
  expect(errors).toEqual([])
})

test('J3b the Caf out of meal times is quiet', async ({ page }) => {
  const errors = await atGate(page, { patch: { minutes: 10 * 60 + 15, phase: 'lecture' } })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-enter-caf')))
  await expect(page.locator('#caf3d')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  const quiet = await page.evaluate(() => window.mzansiCafPeople())
  expect(quiet.busy).toBe(false)
  expect(quiet.patrons).toBeLessThanOrEqual(4)
  expect(quiet.staff.length).toBe(4)
  expect(errors).toEqual([])
})

test('J4 campus outside: walkers on the paths, groups on the lawns, a football kick-about', async ({ page }) => {
  const errors = await atGate(page, { patch: LUNCH })
  const life = await page.evaluate(() => window.mzansiCampusLife())
  expect(life.walkers).toBeGreaterThanOrEqual(15)
  expect(life.groups).toBeGreaterThanOrEqual(4)
  expect(life.sitting).toBeGreaterThanOrEqual(6)
  expect(life.kick).toBeTruthy()
  const b0 = life.kick.ball
  await expect.poll(async () => { const b = (await page.evaluate(() => window.mzansiCampusLife())).kick.ball; return Math.hypot(b[0] - b0[0], b[1] - b0[1]) }, { timeout: 10000, message: 'the ball moves' }).toBeGreaterThan(0.5)
  await shot(page, 'j4-campus')
  expect(errors).toEqual([])
})
