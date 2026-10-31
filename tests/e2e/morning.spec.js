// Day 1 morning slice, played by taps only (the name field is the one typed setup step).
// Run: npx playwright test tests/e2e/morning.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

// Both runs are heavy 3D scenes; one at a time keeps frame timing honest.
test.describe.configure({ mode: 'serial' })

async function expectBubbleClear(page) {
  const box = await page.evaluate(() => {
    const b = document.querySelector('.mm-bubble:not([hidden])')
    const g = document.querySelector('.g-goal')
    return b && g ? [b.getBoundingClientRect().top, g.getBoundingClientRect().bottom] : null
  })
  if (box) expect(box[0]).toBeGreaterThanOrEqual(box[1])
}

async function newGame(page, query, gender = 'female') {
  await page.goto(`/${query}&fast=1#/new`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/${query}&fast=1#/new`)
  await page.locator(`[data-part="gender"][data-id="${gender}"]`).tap()
  await page.locator('#name').fill(gender === 'male' ? 'Lethabo' : 'Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
}

const OUT = process.env.MORNING_SHOTS || 'test-results/morning'

test('day 1 morning: room to campus', async ({ page }) => {
  test.setTimeout(360000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  const host = page.locator('#morning3d')
  const data = (k) => host.getAttribute(`data-${k}`)
  const pos = async () => [Number(await data('px')), Number(await data('pz'))]
  const shot = (n) => page.screenshot({ path: `${OUT}/${process.env.MORNING_PREFIX || 'morning'}_${n}.png` })
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 45000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()

  // Home screen first: no save yet, so no Continue.
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=1&talk=auto#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&roommate=1&latebus=0&snooze=1&talk=auto#/')
  await expect(page.locator('[data-act="start"]')).toBeVisible()
  await expect(page.locator('[data-act="continue"]')).toHaveCount(0)
  await expect(page.locator('[data-act="edit-char"]')).toHaveCount(0)
  await expect(page.getByText('Sign in')).toBeVisible()
  await expect(page.getByText('Settings')).toBeVisible()
  await shot('0_home')
  await page.locator('[data-act="start"]').tap()
  await expect(page).toHaveURL(/#\/rules/) // first time: the campus rules come first
  await page.locator('#agree').check()
  await page.locator('[data-act="agree"]').tap()
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  // Part 2: your story. The Hustler path sets the dream; interest picks who waits at the bus stop.
  await expect(page.locator('main[data-step="story"]').last()).toBeVisible()
  await page.locator('[data-act="story"][data-k="funding"][data-id="bursary"]').tap()
  await page.locator('[data-act="story"][data-k="path"][data-id="hustler"]').tap()
  await page.locator('[data-act="story"][data-k="interest"][data-id="girls"]').tap()
  await expect(page.locator('[data-k="dream"][data-id="hustle"]')).toHaveAttribute('aria-pressed', 'true')
  await shot('0b_story')
  await page.locator('[data-step="story"] [data-act="begin"]').tap()

  await expect(page).toHaveURL(/#\/morning/)
  await expect(page.locator('.g-goal')).toContainText('Get to your 9:00 lecture on time.')
  await expect(page.locator('.g-goal')).toContainText('min left')
  // Zanele greets and waves, with her name on the bubble.
  await expect(host).toHaveAttribute('data-wave', '1', { timeout: 20000 })
  await expect(page.locator('.mm-bubble .mm-name')).toHaveText('Zanele')
  await expect(host).toHaveAttribute('data-roommate', '1')
  await shot('1a_zanele_wave')
  // ?snooze=1: one snooze, the clock rolls 07:00 -> 07:10.
  await expect(host).toHaveAttribute('data-rolled', '07:10', { timeout: 20000 })
  await shot('1_room_wake')

  await expect(host).toHaveAttribute('data-wakeup', 'sit', { timeout: 60000 })
  await page.waitForTimeout(500)
  await shot('1b_sit_up')
  await atStep('kettle')
  const bed = await pos()
  expect(bed[0]).toBeGreaterThan(-1.6) // got out of bed
  await tapGo()
  await page.waitForTimeout(500)
  await shot('2_kettle_walk')
  await atStep('roommate')
  expect(Number(await data('path'))).toBeGreaterThan(1) // walked around furniture, not straight
  const atKettle = await pos()
  expect(Math.hypot(atKettle[0] - bed[0], atKettle[1] - bed[1])).toBeGreaterThan(1)
  await expect(page.locator('.mm-bubble')).toContainText('The shelf is bare. Your roommate got the last packet.', { timeout: 30000 })
  await page.waitForTimeout(300)
  await expectBubbleClear(page)
  await shot('4_roommate_event')
  await expect(page.locator('.mm-choice')).toHaveCount(3, { timeout: 10000 }) // tuck shop, skip, walk hungry
  await page.locator('.mm-choice').first().tap()
  await expect(page.locator('.mm-choice')).toHaveCount(0) // buttons vanish on tap
  await expect(host).toHaveAttribute('data-choice', 'tuck')
  await atStep('eating')
  await page.waitForTimeout(700)
  await shot('3_noodles')

  // One choice to head out (no door, bus stop or board buttons): walk or skip.
  await atStep('head-out')
  await expect(page.locator('.mm-choice')).toHaveCount(2)
  await expect(page.locator('.mm-choice').nth(1)).toContainText('Skip to campus')
  await shot('4b_head_out')
  await page.locator('.mm-choice').first().tap()
  await atStep('exit')
  await expect.poll(async () => Number(await data('door')), { timeout: 30000 }).toBeLessThan(-0.5)
  await shot('5_door_exit')
  const yard = await pos()

  // The bus stop: the meet-cute. Someone is waiting; the bus is late.
  await atStep('stop')
  const stop = await pos()
  expect(stop[0]).toBeGreaterThan(10) // out of the room (x < 3) and down the road to the stop
  void yard
  await expect(page.locator('.mm-sign')).toContainText('Delayed')
  await shot('6_bus_stop')
  await atStep('meet')
  await expect(page.locator('.mm-choice')).toHaveCount(3)
  await shot('6c_meet_choice')
  await page.locator('.mm-choice').nth(1).tap() // ask about the bus: you learn their name
  await expect(page.locator('.mm-bubble')).toContainText(/I’m (Amahle|Kabelo)/, { timeout: 20000 })
  await shot('6d_meet_name')
  await expect(host).toHaveAttribute('data-crush-known', '1', { timeout: 20000 })

  await atStep('bus-arriving')
  await page.waitForTimeout(1500)
  await shot('7_bus_arriving')
  await atStep('riding')
  await expect(page.locator('.mm-choice')).toHaveCount(2, { timeout: 20000 })
  await expect(page.locator('.mm-choice').first()).toContainText(/Next to (Amahle|Kabelo)/)
  await shot('8_riding')
  await page.locator('.mm-choice').first().tap()
  await expect(host).toHaveAttribute('data-seat', 'next')

  await atStep('done')
  await expect(page.locator('.mm-card')).toBeVisible()
  await expect(page.locator('.mm-card')).toContainText('Lecture 09:00')
  await expect(host).toHaveAttribute('data-ontime', '1')
  await expect(page.locator('.mm-card')).toContainText('On time')
  const arrived = (await page.locator('.mm-times b').first().textContent()).trim()
  expect(arrived >= '08:40' && arrived <= '08:55').toBe(true)
  await shot('9_arrival_card')
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.phase).toBe('lecture')
  expect(run.morningDone).toBe(true)
  expect(run.crush).toMatchObject({ id: 'amahle', met: 'bus', opener: 'bus', nameKnown: true, sat: true })
  expect(run.character).toMatchObject({ funding: 'bursary', path: 'hustler', dream: 'hustle', interest: 'girls' })
  expect(run.at).toBe('gate')
  // The clock keeps the arrival time, and Zanele (met in the room) is the bestie with no repeat card.
  const hhmm = `${String(Math.floor(run.minutes / 60)).padStart(2, '0')}:${String(run.minutes % 60).padStart(2, '0')}`
  expect(hhmm).toBe(arrived)
  expect(run.bestieName).toBe('Zanele')
  expect(run.queue.some((card) => card.kind === 'bestie')).toBe(false)
  await expect(page.locator('[data-spawn="gate"]')).toBeAttached({ timeout: 20000 })
  // Other students: 10-15 on campus, some of them walking between buildings.
  const world = page.locator('#world')
  await expect.poll(async () => Number(await world.getAttribute('data-crowd')), { timeout: 20000 }).toBeGreaterThanOrEqual(10)
  await expect.poll(async () => Number(await world.getAttribute('data-crowd-walking')), { timeout: 20000 }).toBeGreaterThan(0)
  // Personal space: over a few seconds nobody gets inside the player.
  let nearest = 99
  for (let i = 0; i < 12; i++) {
    nearest = Math.min(nearest, Number(await world.getAttribute('data-nearest')))
    await page.waitForTimeout(250)
  }
  expect(nearest).toBeGreaterThan(0.7)
  await page.waitForTimeout(1500)
  // Arrival: today's three goals slide in (must, story, dream) with the year dream.
  await expect(page.locator('.g-goals')).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.g-goal-list li')).toHaveCount(3)
  await expect(page.locator('.g-goal-list li').first()).toContainText('9:00 lecture')
  await expect(page.locator('.g-dream')).toContainText('R5,000')
  await expect(page.locator('.g-goal-list li.dream')).toContainText('Earn your first R50')
  await shot('10_campus')
  // Any queued result cards (bestie, etc.) come first; clear them.
  for (let i = 0; i < 6 && await page.locator('.g-result [data-act]').count(); i++) {
    await page.locator('.g-result [data-act]').first().tap()
    await page.waitForTimeout(300)
  }
  await expect(page.locator('.g-route')).toContainText('Your lecture is at SMIG')
  // Goal ladder: the right-now chip points at the lecture; the goal count opens today's card again.
  await expect(page.locator('.g-now')).toContainText('Lecture at SMIG')
  await expect(page.locator('.g-goalsbtn')).toContainText('0/3')
  await shot('10b_now_chip')
  // Home keeps the save: Continue appears.
  await page.locator('.g-home').first().tap()
  await expect(page.locator('[data-act="continue"]')).toBeVisible()
  expect(errors).toEqual([])
})

test('day 1 morning: forced late bus is Running late', async ({ page }) => {
  test.setTimeout(360000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 40000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()
  // A male student rooms with Sipho, not Zanele.
  await newGame(page, '?roommate=0&latebus=1&snooze=0&talk=auto&route=walk&meet=funny&seat=back', 'male')
  await expect(host).toHaveAttribute('data-roomie', 'Sipho', { timeout: 20000 })
  await atStep('kettle')
  await expect(host).toHaveAttribute('data-latebus', '1')
  await tapGo()
  await atStep('noodles')
  await expect(page.locator('body')).toHaveAttribute('data-sounds', /kettle/, { timeout: 10000 })
  await expect(host).toHaveAttribute('data-cup', '1', { timeout: 10000 })
  await expect(host).toHaveAttribute('data-packet', 'used', { timeout: 10000 })
  await atStep('stop')
  await expect(page.locator('body')).toHaveAttribute('data-sounds', /music_campus/)
  await expect(page.locator('body')).not.toHaveAttribute('data-sounds', /kettle/)
  await expect(page.locator('.mm-sign')).toContainText('Delayed')
  await page.screenshot({ path: `${OUT}/${process.env.MORNING_PREFIX || 'morning'}_6b_delayed.png` })
  await atStep('boarding')
  await expect(page.locator('body')).toHaveAttribute('data-sounds', /bus_engine/)
  await atStep('done')
  await expect(page.locator('.mm-card')).toContainText('know the name')
  await expect(page.locator('body')).not.toHaveAttribute('data-sounds', /bus_engine/)
  await expect(host).toHaveAttribute('data-ontime', '0')
  await expect(page.locator('.mm-card')).toContainText('Running late')
  await page.screenshot({ path: `${OUT}/${process.env.MORNING_PREFIX || 'morning'}_9b_late.png` })
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.character.avatar.gender).toBe('male')
  expect(run.bestieName).toBe('Sipho')
  expect(run.crush).toMatchObject({ id: 'amahle', opener: 'funny', nameKnown: false, sat: false })
  expect(errors).toEqual([])
})

test('day 1 morning: Sipho has his own lines, and you can walk to the bus hungry', async ({ page }) => {
  test.setTimeout(240000)
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 45000 })
  await newGame(page, '?roommate=1&latebus=0&snooze=0&talk=auto', 'male')
  await expect(page.locator('.mm-bubble')).toContainText('Sipho', { timeout: 30000 })
  await expect(page.locator('.mm-bubble')).not.toContainText('Zanele')
  await page.screenshot({ path: `${OUT}/s1_bed.png` })
  await atStep('kettle')
  await page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()
  await expect(page.locator('.mm-bubble')).toContainText('Sipho', { timeout: 30000 }) // his own "last packet" line
  await expect(page.locator('.mm-choice')).toHaveCount(3, { timeout: 30000 })
  await expect(page.locator('.mm-choice').nth(2)).toContainText('Walk to the bus hungry')
  await page.locator('.mm-choice').nth(2).tap()
  await expect(host).toHaveAttribute('data-choice', 'hungry')
  // Then the one head-out choice; walking goes straight out of the room.
  await atStep('head-out')
  await page.locator('.mm-choice').first().tap()
  await atStep('exit')
  await atStep('stop')
})

test('day 1 morning: four breakfasts; the caf one is eaten on campus', async ({ page }) => {
  test.setTimeout(240000)
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 45000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()
  await newGame(page, '?roommate=0&latebus=0&snooze=0&talk=auto')
  await atStep('kettle')
  const options = page.locator('.mm-choice')
  await expect(options).toHaveCount(4)
  await expect(options.nth(0)).toContainText('Noodles in res')
  await expect(options.nth(1)).toContainText('Tuck shop')
  await expect(options.nth(2)).toContainText('Caf breakfast')
  await expect(options.nth(3)).toContainText('hungry')
  await page.screenshot({ path: `${OUT}/b1_breakfast_choices.png` })
  const money = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money)
  await options.nth(2).tap()
  await expect(host).toHaveAttribute('data-choice', 'caf')
  // Skip to campus: one fade from res to the gate, the clock still runs.
  await atStep('head-out')
  await page.locator('.mm-choice').nth(1).tap()
  await expect(host).toHaveAttribute('data-route', 'skip')
  await atStep('caf-breakfast')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/b2_caf_breakfast.png` })
  await atStep('done')
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money)
  expect(after).toBe(money - 30)
  const arrived = (await page.locator('.mm-times b').first().textContent()).trim()
  expect(arrived >= '08:40' && arrived <= '08:59').toBe(true)
})
