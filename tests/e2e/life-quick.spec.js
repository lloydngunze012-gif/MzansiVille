// Job L (owner, 13 Nov): consequences, music, a reason to come (quick project).
//   L1 Tired: under 20 Energy a costly activity says "Too tired" and walking is slower; at 0 the card with three
//      ways out; SunnyBay Eats: a Caf dish, its price plus the fee, the rider rides up and the food arrives; Go home
//      and sleep: the rest of this part of the day goes and Energy comes back.
//   L2 Today on campus opens the visit (three things, the topic, a suggestion), the pill counts what you did, a
//      prompt comes in the one small-card slot, and "Today you..." after the wait.
// (The music zones are in sound-quick; Ask a friend needs two phones.)
import { test, expect } from '@playwright/test'
import { atGate, run } from '../city.js'
import EATS from '../../data/campusville/eats.json' with { type: 'json' }

const BASE = { phase: 'social', minutes: 13 * 60 + 5, slotsLeft: 9, stats: { money: 500, energy: 95, grades: 50, social: 30, hunger: 70 } }
const tired = (page) => page.evaluate(() => window.mzansiTired())
const pop = (page, kind) => page.locator(`.sl-pop-wrap[data-pop="${kind}"]`)

test('L1 tired: too tired, the empty card, delivery by scooter, home to sleep', async ({ page }) => {
  test.setTimeout(150000)
  const errors = await atGate(page, { patch: BASE })
  // under 20: the library's group table (-6 Energy) refuses
  await page.evaluate(() => window.mzansiSetStats({ energy: 15 }))
  await page.evaluate(() => { location.hash = '#/place/library' })
  const row = page.locator('.g-sheet [data-act="do"][data-id="lib_group"]')
  await expect(row).toBeVisible({ timeout: 20000 })
  await expect(page.locator('.g-sheet')).toContainText('Too tired')
  await page.evaluate(() => { location.hash = '#/play' })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  // 0 Energy: the card, at a calm moment
  await page.evaluate(() => window.mzansiSetStats({ energy: 0 }))
  await expect(pop(page, 'empty')).toBeVisible({ timeout: 20000 })
  await expect(pop(page, 'empty').locator('[data-ti]')).toHaveCount(4)
  // delivery: the menu, a dish, paid with the fee
  await pop(page, 'empty').locator('[data-ti="order"]').tap()
  await expect(pop(page, 'eats')).toBeVisible()
  const dish = (await tired(page)).menu[0]
  const before = (await run(page)).stats
  await pop(page, 'eats').locator(`[data-ti-dish="${dish.id}"]`).tap()
  await expect.poll(async () => Math.round((await run(page)).stats.money)).toBe(Math.round(before.money - dish.price - EATS.fee))
  // the rider comes up to you (a scooter in the scene) and the food arrives
  await expect.poll(async () => (await tired(page)).log.find((l) => l.k === 'rider')?.scene, { timeout: 30000, message: 'the rider rode up in the campus scene' }).toBe(true)
  await expect.poll(async () => (await tired(page)).log.some((l) => l.k === 'arrived'), { timeout: 30000 }).toBe(true)
  const fed = (await run(page)).stats
  expect(fed.energy).toBeGreaterThanOrEqual(EATS.energy)
  expect(fed.hunger).toBeGreaterThan(before.hunger)
  // empty again: Go home and sleep, in the day: the next part of the day, +napEnergy
  await page.evaluate(() => window.mzansiSetStats({ energy: 0 }))
  await expect(pop(page, 'empty')).toBeVisible({ timeout: 20000 })
  const phase = (await run(page)).phase
  await pop(page, 'empty').locator('[data-ti="sleep"]').tap()
  await expect.poll(async () => (await run(page)).phase, { timeout: 20000 }).not.toBe(phase)
  expect((await run(page)).stats.energy).toBe(EATS.napEnergy)
  expect(errors).toEqual([])
})

test('L2 today on campus: the visit card, the 0/3 pill, one prompt at a time, today you', async ({ page }) => {
  test.setTimeout(180000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await atGate(page, { patch: BASE, query: '&today=1&promptgap=6&summarygap=30' })
  // the visit's card opens by itself at the first calm moment
  const card = pop(page, 'today')
  await expect.poll(async () => (await card.isVisible().catch(() => false)) || (await page.evaluate(() => window.mzansiToday())).log.some((l) => l.k === 'today'), { timeout: 20000 }).toBe(true)
  if (await card.isVisible().catch(() => false)) await card.locator('[data-td="go"]').tap()
  await expect(card).toBeHidden()
  // and again from the pill
  await page.locator('[data-act="today"]').tap()
  await expect(card).toBeVisible()
  await expect(card.locator('.td-thing')).toHaveCount(3)
  await expect(card).toContainText('Hot topic')
  await card.locator('[data-td="go"]').tap()
  await expect(card).toBeHidden()
  await expect(page.locator('[data-act="today"]')).toHaveText(/0\/3/)
  // an activity: one of the three ticks
  await page.evaluate(() => { location.hash = '#/place/quad' })
  const any = page.locator('.g-sheet [data-act="do"][data-id="quad_friends"]')
  await expect(any).toBeVisible({ timeout: 20000 })
  await any.tap()
  await expect.poll(async () => (await page.evaluate(() => window.mzansiToday())).done, { timeout: 60000 }).toBeGreaterThanOrEqual(1)
  // close whatever the activity left open, then wait for a prompt: one small card, never two
  for (let i = 0; i < 6; i++) { const b = page.locator('[role="dialog"] button:visible').first(); if (!(await b.isVisible().catch(() => false))) break; await b.tap().catch(() => {}); await page.waitForTimeout(400) }
  await page.evaluate(() => { location.hash = '#/play' })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiToday())).log.some((l) => l.k === 'prompt'), { timeout: 60000 }).toBe(true)
  expect(await page.locator('.fm-card').count()).toBeLessThanOrEqual(1)
  // Today you... after the wait
  await expect(pop(page, 'today-you')).toBeVisible({ timeout: 60000 })
  await expect(pop(page, 'today-you')).toContainText('Tomorrow')
  await pop(page, 'today-you').locator('[data-td="stay"]').tap()
  expect(errors).toEqual([])
})
