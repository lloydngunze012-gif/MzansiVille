// Helpers for the SunnyBay tests (tests/e2e/city.spec.js, city-quick.spec.js).
import { expect } from '@playwright/test'

export const run = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
export const money = async (page) => Math.floor((await run(page)).stats.money)
export const city = (page) => page.locator('#city3d')
export const info = (page) => page.evaluate(() => window.mzansiCity.info())

// A quick-start student standing just inside the Main Gate at a calm moment. patch: extra fields for the save's run.
export async function atGate(page, { patch = {}, query = '' } = {}) {
  const errors = []
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('PAGEERROR', String(e).slice(0, 300)) })
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|supabase|realtime/i.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)) })
  await page.goto(`/?fast=1&enrol=quick&morning=0${query}#/new`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload()
  await page.locator('[data-preset="q-priya"]').tap()
  await page.locator('#name').fill('Lerato')
  await page.locator('[data-act="qs-play"]').tap()
  await page.waitForURL(/#\/play/, { timeout: 30000 })
  await page.evaluate((p) => {
    const s = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(s.run, { morningDone: true, resMorningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true, lectureRoute: false, dropOff: false, cardAsked: '2099-01-01', cardDone: true }, p)
    if (p.money != null) s.run.stats.money = p.money
    delete s.run.money
    localStorage.setItem('mzansiville.v1', JSON.stringify(s))
    localStorage.setItem('mzansiville.mapHint', '1')
    localStorage.setItem('mzansiville.view', '3d')
  }, patch)
  await page.goto(`/?fast=1&morning=0&spawn=gate${query}#/play`)
  if (!patch.cityAt) {
    await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 90000 })
    for (let i = 0; i < 3; i++) {
      const card = page.locator('[role="dialog"] button:visible').first()
      if (!(await card.isVisible().catch(() => false))) break
      await card.tap()
      await page.waitForTimeout(500)
    }
    const out = page.locator('.house-out')
    if (await out.isVisible().catch(() => false)) { await out.tap(); await page.waitForTimeout(600) }
  }
  return errors
}
// Out of the gate with a real tap on the road past it.
export async function intoCity(page) {
  await page.evaluate(() => { window.mzansiWalkTo(0, 99) })
  await expect.poll(async () => (await page.evaluate(() => window.mzansiPlayerPos())).z, { timeout: 60000 }).toBeGreaterThan(98.5)
  // (standing still, the camera settled: the tap lands where it is aimed)
  await expect.poll(() => page.evaluate(() => window.mzansiWalkPace().now), { timeout: 20000 }).toBe(0)
  await page.waitForTimeout(900)
  const p = await page.evaluate(() => window.mzansiScreenOf(0.4, 102.8)) // (the road at the gate line: a tap there or past it walks you out)
  await page.touchscreen.tap(p.x, p.y)
  await expect(city(page)).toHaveAttribute('data-ready', '1', { timeout: 90000 })
  await page.waitForTimeout(700)
}
export const tapWorld = async (page, x, z, y = 0) => {
  const p = await page.evaluate(([a, b, c]) => window.mzansiCity.px(a, c, b), [x, z, y])
  await page.touchscreen.tap(p.x, p.y)
}

