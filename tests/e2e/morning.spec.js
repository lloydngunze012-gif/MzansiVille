// Day 1 morning slice, played by taps only (the name field is the one typed setup step).
// Run: npx playwright test tests/e2e/morning.spec.js --config playwright.edge.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = process.env.MORNING_SHOTS || 'test-results/morning'

test('day 1 morning: room to campus', async ({ page }) => {
  test.setTimeout(150000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  const host = page.locator('#morning3d')
  const data = (k) => host.getAttribute(`data-${k}`)
  const pos = async () => [Number(await data('px')), Number(await data('pz'))]
  const shot = (n) => page.screenshot({ path: `${OUT}/morning_${n}.png` })
  const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 30000 })
  const tapGo = () => page.locator('.mm-bar:not([hidden]) .mm-go').first().tap()

  await page.goto('/?roommate=1#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?roommate=1#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()

  await expect(page).toHaveURL(/#\/morning/)
  await expect(page.locator('.g-goal')).toContainText('Get to your 9:00 lecture on time.')
  await expect(page.locator('.g-goal')).toContainText('min left')
  await atStep('wake')
  await expect(host).toHaveAttribute('data-roommate', '1')
  await shot('1_room_wake')

  await atStep('kettle')
  const bed = await pos()
  expect(bed[0]).toBeGreaterThan(-1.6) // got out of bed
  await tapGo()
  await page.waitForTimeout(500)
  await shot('2_kettle_walk')
  await atStep('roommate')
  const atKettle = await pos()
  expect(Math.hypot(atKettle[0] - bed[0], atKettle[1] - bed[1])).toBeGreaterThan(1)
  await page.waitForTimeout(800)
  await shot('4_roommate_event')
  await expect(page.locator('.mm-choice')).toHaveCount(2, { timeout: 10000 })
  await page.locator('.mm-choice').first().tap()
  await expect(host).toHaveAttribute('data-choice', 'tuck')
  await atStep('eating')
  await page.waitForTimeout(700)
  await shot('3_noodles')

  await atStep('door')
  await tapGo()
  await atStep('exit')
  await page.waitForTimeout(900)
  expect(Number(await data('door'))).toBeLessThan(-0.5)
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
  await shot('9_arrival_card')
  await page.locator('[data-mm="continue"]').tap()
  await expect(page).toHaveURL(/#\/play/)
  const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
  expect(run.phase).toBe('lecture')
  expect(run.morningDone).toBe(true)
  expect(errors).toEqual([])
})
