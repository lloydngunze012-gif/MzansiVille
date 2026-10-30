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

async function newGame(page, query) {
  await page.goto(`/${query}#/new`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/${query}#/new`)
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
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
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 30000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()

  // Home screen first: no save yet, so no Continue.
  await page.goto('/?roommate=1&latebus=0&snooze=1#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?roommate=1&latebus=0&snooze=1#/')
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
  await expect(page.locator('.mm-choice')).toHaveCount(2, { timeout: 10000 })
  await page.locator('.mm-choice').first().tap()
  await expect(page.locator('.mm-choice')).toHaveCount(0) // buttons vanish on tap
  await expect(host).toHaveAttribute('data-choice', 'tuck')
  await atStep('eating')
  await page.waitForTimeout(700)
  await shot('3_noodles')

  await atStep('door')
  await tapGo()
  await atStep('exit')
  await expect.poll(async () => Number(await data('door')), { timeout: 30000 }).toBeLessThan(-0.5)
  await shot('5_door_exit')

  await atStep('to-stop')
  const yard = await pos()
  await tapGo()
  await atStep('stop')
  const stop = await pos()
  expect(stop[0] - yard[0]).toBeGreaterThan(5)
  await shot('6_bus_stop')

  await atStep('bus-arriving')
  await page.waitForTimeout(1500)
  await shot('7_bus_arriving')
  await atStep('board')
  expect(Number(await data('busx'))).toBeGreaterThan(10)
  await tapGo()
  await atStep('riding')
  const busStart = Number(await data('busx'))
  await page.waitForTimeout(1500)
  expect(Number(await data('busx'))).toBeGreaterThan(busStart + 5)
  await shot('8_riding')

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
  expect(run.at).toBe('gate')
  await expect(page.locator('[data-spawn="gate"]')).toBeAttached({ timeout: 20000 })
  // Any queued result cards (bestie, etc.) come first; clear them.
  for (let i = 0; i < 6 && await page.locator('.g-result [data-act]').count(); i++) {
    await page.locator('.g-result [data-act]').first().tap()
    await page.waitForTimeout(300)
  }
  await expect(page.locator('.g-route')).toContainText('Your lecture is at the Business Hall')
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
  await newGame(page, '?roommate=0&latebus=1&snooze=0')
  await atStep('kettle')
  await expect(host).toHaveAttribute('data-latebus', '1')
  await tapGo()
  await atStep('noodles')
  await expect(host).toHaveAttribute('data-cup', '1', { timeout: 10000 })
  await expect(host).toHaveAttribute('data-packet', 'used', { timeout: 10000 })
  await atStep('door')
  await tapGo()
  await atStep('to-stop')
  await tapGo()
  await atStep('stop')
  await expect(page.locator('.mm-sign')).toContainText('Delayed')
  await page.screenshot({ path: `${OUT}/${process.env.MORNING_PREFIX || 'morning'}_6b_delayed.png` })
  await atStep('board')
  await tapGo()
  await atStep('done')
  await expect(host).toHaveAttribute('data-ontime', '0')
  await expect(page.locator('.mm-card')).toContainText('Running late')
  await page.screenshot({ path: `${OUT}/${process.env.MORNING_PREFIX || 'morning'}_9b_late.png` })
  expect(errors).toEqual([])
})
