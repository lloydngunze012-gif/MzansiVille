// Day 1 morning slice, played by taps only (the name field is the one typed setup step).
// Run: npx playwright test tests/e2e/morning.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

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
  await enrolUI(page, { name: gender === 'male' ? 'Lethabo' : 'Thandi', house: 1, course: 1 })
  await toDay2(page, `/${query}&fast=1`)
}

// Day 1 is leaving home (tests/e2e/home.spec.js); the res morning is day 2. Start the
// save on the morning of day 2, then load the game.
async function toDay2(page, url) {
  await expect(page).toHaveURL(/#\/morning/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { day: 2, phase: 'wake', minutes: 7 * 60, morningDone: true, mode: 'play' })
    delete save.run.morningStart
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto(`${url}#/play`)
  await page.reload()
  await expect(page).toHaveURL(/#\/morning/, { timeout: 20000 })
}

const OUT = process.env.MORNING_SHOTS || 'test-results/morning'

test('day 2 res morning: room to campus', async ({ page }) => {
  test.setTimeout(360000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  // (a Supabase function not set up yet, e.g. save_player_card before the Piece 1a SQL
  // is run, is the backend's state, not a morning error)
  page.on('console', (m) => { if (m.type() === 'error' && !/supabase\.co/.test(m.location()?.url || '')) errors.push(m.text()) })
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
  // (owner, 6 Nov: one line about UMzansi and one button)
  await expect(page.locator('.tc-foot button')).toHaveCount(1)
  await expect(page.locator('[data-act="start"]')).toHaveText('Enrol')
  await shot('0_home')
  await page.locator('[data-act="start"]').tap()
  await expect(page).toHaveURL(/#\/rules/) // first time: the campus rules come first
  await page.locator('#agree').check()
  await page.locator('[data-act="agree"]').tap()
  // Enrolment: look, who you are, your vibe, your card (src/ui/enrol.js).
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  // (day 1 is leaving home now: tests/e2e/home.spec.js; this is the res morning, day 2)
  await toDay2(page, '/?fast=1&roommate=1&latebus=0&snooze=1&talk=auto')

  await expect(page).toHaveURL(/#\/morning/)
  await expect(page.locator('.g-goal')).toContainText('Get to your 9:00 lecture on time.')
  await expect(page.locator('.g-goal')).toContainText('min left')
  // Anisha greets and waves, with her name on the bubble.
  await expect(host).toHaveAttribute('data-wave', '1', { timeout: 20000 })
  await expect(page.locator('.mm-bubble .mm-name')).toHaveText('Anisha')
  await expect(host).toHaveAttribute('data-roommate', '1')
  await shot('1a_roommate_wave')
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

  // No bus (owner, 6 Nov): you live on campus. Shower, then out of your own door.
  await atStep('exit')
  await expect.poll(async () => Number(await data('door')), { timeout: 30000 }).toBeLessThan(-0.5)
  await shot('5_door_exit')

  await atStep('done')
  await cardOnTop(page)
  await expect(page.locator('.mm-card')).toContainText('Lecture 09:00')
  await expect(host).toHaveAttribute('data-ontime', '1')
  await expect(page.locator('.mm-card')).toContainText('On time')
  const arrived = (await page.locator('.mm-times b').first().textContent()).trim()
  expect(arrived >= '07:00' && arrived < '09:00', 'out of the door before the 09:00 lecture (no bus to wait for)').toBe(true)
  await shot('9_arrival_card')
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.phase).toBe('lecture')
  expect(run.morningDone).toBe(true)
  expect(run.crush?.id, 'a crush made for the week (you meet on campus)').toBeTruthy()
  // (enrolment has no story step since 6 Nov: the defaults)
  expect(run.character).toMatchObject({ funding: 'nsfas', path: 'scholar', dream: 'deans', interest: 'everyone' })
  expect(run.outDoor).toBe(true) // (campus starts at your house's door)
  // The clock keeps the arrival time, and Anisha (met in the room) is the bestie with no repeat card.
  const hhmm = `${String(Math.floor(run.minutes / 60)).padStart(2, '0')}:${String(run.minutes % 60).padStart(2, '0')}`
  expect(hhmm).toBe(arrived)
  expect(run.bestieName).toBe('Anisha')
  expect(run.queue.some((card) => card.kind === 'bestie')).toBe(false)
  await expect(page.locator('[data-spawn="door"]')).toBeAttached({ timeout: 20000 })
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
  await expect(page.locator('.g-goal-list li').first()).toContainText(/lecture/i) // (day 2: "Go to your lecture at SMIG")
  await expect(page.locator('.g-dream')).toContainText("Dean's List") // (the default dream: enrolment has no story step since 6 Nov)
  await expect(page.locator('.g-goal-list li.dream')).toHaveCount(1)
  await shot('10_campus')
  // Any queued result cards (bestie, etc.) come first; clear them.
  for (let i = 0; i < 6 && await page.locator('.g-result [data-act]').count(); i++) {
    await page.locator('.g-result [data-act]').first().tap()
    await page.waitForTimeout(300)
  }
  await expect(page.locator('.g-route')).toContainText('Your lecture is at SMIG')
  // Goal ladder: the right-now chip points at the lecture; the goal count opens today's card again.
  await expect(page.locator('.g-now')).toContainText(/lecture at SMIG/i)
  await expect(page.locator('.g-goalsbtn')).toContainText('0/3')
  await shot('10b_now_chip')
  // Home keeps the save: Continue appears.
  await page.locator('.g-home').first().tap()
  await expect(page.locator('[data-act="continue"]')).toBeVisible()
  expect(errors).toEqual([])
})

test.skip('day 1 morning: forced late bus is Running late (no bus on day 1 since 6 Nov)', async ({ page }) => {
  test.setTimeout(360000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 40000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()
  // A male student rooms with Ravi, not Anisha.
  await newGame(page, '?roommate=0&latebus=1&snooze=0&talk=auto&route=walk&meet=funny&seat=back', 'male')
  await expect(host).toHaveAttribute('data-roomie', 'Ravi', { timeout: 20000 })
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
  expect(run.bestieName).toBe('Ravi')
  expect(run.crush).toMatchObject({ id: 'mia', opener: 'funny', nameKnown: false, sat: false })
  expect(errors).toEqual([])
})

// The morning always ends on the arrival card with the fade lifted (it used to stay down
// over the card when there was no caf breakfast). Played to the end both ways.
async function cardOnTop(page) {
  await expect(page.locator('.mm-card')).toBeVisible()
  await expect(page.locator('.mm-fade')).toBeHidden()
  await expect(page.locator('#morning3d')).toHaveAttribute('data-fade', '0')
  // nothing covers the Continue button: the topmost element at its middle is the button
  const top = await page.locator('[data-mm="continue"]').evaluate((b) => {
    const r = b.getBoundingClientRect()
    return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-mm="continue"]') === b
  })
  expect(top, 'the Continue button is on top').toBe(true)
}

test('the res morning to the end without a caf breakfast (Ravi, out hungry)', async ({ page }) => {
  test.setTimeout(240000)
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 45000 })
  await newGame(page, '?roommate=1&latebus=0&snooze=0&talk=auto', 'male')
  await expect(page.locator('.mm-bubble')).toContainText('Ravi', { timeout: 30000 })
  await expect(page.locator('.mm-bubble')).not.toContainText('Anisha')
  await atStep('kettle')
  const options = page.locator('.mm-choice')
  await expect(options).toHaveCount(4)
  await expect(options.nth(3)).toContainText('hungry')
  await options.nth(3).tap()
  await expect(host).toHaveAttribute('data-choice', 'hungry')
  await atStep('exit')
  await atStep('done')
  await page.waitForTimeout(800)
  await cardOnTop(page)
  await page.screenshot({ path: `${OUT}/e1_end_hungry.png` })
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.morningDone).toBe(true)
  expect(run.bestieName).toBe('Ravi')
})

test('the res morning to the end with a caf breakfast', async ({ page }) => {
  test.setTimeout(240000)
  const host = page.locator('#morning3d')
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 45000 })
  await newGame(page, '?roommate=0&latebus=0&snooze=0&talk=auto')
  await atStep('kettle')
  const options = page.locator('.mm-choice')
  await expect(options).toHaveCount(4)
  await expect(options.nth(0)).toContainText('Noodles in res')
  await expect(options.nth(1)).toContainText('Tuck shop')
  await expect(options.nth(2)).toContainText('Caf breakfast')
  await expect(options.nth(3)).toContainText('hungry')
  const money = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money)
  await options.nth(2).tap()
  await expect(host).toHaveAttribute('data-choice', 'caf')
  await atStep('done') // (the caf breakfast is eaten under the fade on the way: the R30 below)
  await page.waitForTimeout(800)
  await cardOnTop(page)
  await page.screenshot({ path: `${OUT}/e2_end_caf.png` })
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run.stats.money)
  expect(after).toBe(money - 30)
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.morningDone).toBe(true)
})
