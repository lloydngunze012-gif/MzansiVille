// Day 1 leaving home, the rest: the bus stop by the gate ("Bus to town" rides into town
// and walks you to Greenway Grocer), and the frame rate before and after (the old day-1
// opening, now the day-2 res morning, against the new home scene, and campus).
// Run: npx playwright test tests/e2e/day1-extra.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/home'
test.describe.configure({ mode: 'serial' })
const run = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)

// Frames the page actually draws in 3 s (requestAnimationFrame), for any scene.
async function rafFps(page) {
  return page.evaluate(() => new Promise((resolve) => {
    let n = 0
    const t0 = performance.now()
    const step = () => { n += 1; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else resolve(Math.round((n * 1000) / (performance.now() - t0))) }
    requestAnimationFrame(step)
  }))
}

async function student(page, from = 'KwaZulu-Natal', query = '?talk=auto') {
  await page.goto(`/${query}#/new`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/${query}#/new`)
  await page.locator('[data-part="gender"][data-id="female"]').tap()
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1, from })
}

test('bus stop by the gate: Bus to town, then Greenway Grocer', async ({ page }) => {
  test.setTimeout(240000)
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await student(page, 'KwaZulu-Natal', '?morning=0&fast=1')
  await page.waitForURL(/#\/(play|morning)/)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'leisure', minutes: 15 * 60, lectureResolved: true, at: 'bus_stop' })
    delete save.run.dropOff
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  await page.goto('/?morning=0&fast=1&spawn=bus_stop&g=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/13_bus_stop.png` })
  await page.evaluate(() => { location.hash = '#/place/bus_stop' })
  const bus = page.locator('[data-act="do"][data-id="bus_town"]')
  await bus.waitFor({ state: 'visible', timeout: 15000 })
  await page.screenshot({ path: `${OUT}/14_bus_stop_card.png` })
  const money = (await run(page)).stats.money
  await bus.tap()
  // the ride (a fade into town), then off the bus to Greenway Grocer: its card opens
  await expect(page).toHaveURL(/#\/place\/greenway/, { timeout: 120000 })
  await expect(page.locator('.g-sheet')).toContainText('Greenway Grocer', { timeout: 20000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/15_greenway_after_bus.png` })
  expect((await run(page)).stats.money).toBe(money - 10)
  expect(errors).toEqual([])
})

test('fps: the old opening (res morning) and campus, against the home scene', async ({ page }) => {
  test.setTimeout(300000)
  const fps = {}
  // after: the home scene, both styles, inside and on the street
  for (const from of ['KwaZulu-Natal', 'Limpopo']) {
    await student(page, from, '?talk=manual')
    await expect(page.locator('#home3d')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
    await page.waitForTimeout(2500)
    fps[`home ${from === 'KwaZulu-Natal' ? 'suburban' : 'township'} (bedroom)`] = await rafFps(page)
  }
  // before: the res morning (it opened day 1 until today; day 2 now)
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { day: 2, phase: 'wake', minutes: 7 * 60, morningDone: true, mode: 'play' })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?talk=manual#/play')
  await page.reload()
  await expect(page.locator('#morning3d')).toHaveAttribute('data-step', /greet|wake/, { timeout: 60000 })
  await page.waitForTimeout(2500)
  fps['res morning (the old day-1 opening)'] = await rafFps(page)
  // campus, at the Main Gate
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { day: 2, phase: 'leisure', minutes: 15 * 60, resMorningDone: true, queue: [], lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  await page.goto('/?morning=0&spawn=gate#/play')
  await page.reload()
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 60000 })
  await page.waitForTimeout(2500)
  fps['campus (the gate)'] = await rafFps(page)
  console.log('FPS', JSON.stringify(fps))
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(`${OUT}/fps.json`, JSON.stringify(fps, null, 2))
  test.info().annotations.push({ type: 'fps', description: JSON.stringify(fps) })
})
