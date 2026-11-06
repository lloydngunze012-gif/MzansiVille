// Greenway Grocer (owner, 6 Nov): in your house, "Cook a proper supper" says what's
// missing and offers "Take me to Greenway"; the tap walks you to the shop by the gate
// and its card opens: three shelves, 12 items. Buy pasta and chicken (money drops, the
// fridge fills), an energy drink (Energy now); back home, the supper cooks and uses them
// up. Shots of the shop front, the shop card, the fridge. FPS measured.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'
import { measureFps } from '../fps.js'

const OUT = 'docs/sprints/greenway'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions: { args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] } })
test.setTimeout(300000)

const run = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)

test('out of food at home -> Take me to Greenway -> buy -> cook', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?morning=0#/')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/(play|morning)/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'leisure', minutes: 16 * 60, lectureResolved: true })
    save.run.stats.energy = 50
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
  // At your house's door, its card: the fridge, and supper out of ingredients.
  await page.goto('/?morning=0&spawn=res_o&g=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2500)
  const fps = await measureFps(page)
  console.log(`FPS ${fps}`)
  await page.evaluate(() => { location.hash = '#/place/res_o' })
  const supper = page.locator('[data-act="do"][data-id="house_dinner"]')
  await supper.waitFor({ state: 'visible', timeout: 15000 })
  const before = { disabled: await supper.isDisabled(), why: await supper.locator('.g-why').textContent(), fridge: await page.locator('.gw-fridge').textContent() }
  await page.screenshot({ path: `${OUT}/1-house-out-of-food.png` })
  // Take me to Greenway: you walk there and its card opens.
  const t0 = Date.now()
  await page.locator('.gw-take[data-for="house_dinner"]').tap()
  await expect(page.locator('.gw-items').first()).toBeVisible({ timeout: 90000 })
  const walked = Math.round((Date.now() - t0) / 1000)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/2-shop-card.png` })
  const shelves = await page.locator('.gw-shelf span').allTextContents()
  const items = await page.locator('.gw-item').count()
  // Buy pasta, chicken and an energy drink.
  const money0 = (await run(page)).stats.money
  await page.locator('[data-act="buy"][data-id="pasta"]').tap()
  await page.waitForTimeout(300)
  await page.locator('[data-act="buy"][data-id="chicken"]').tap()
  await page.waitForTimeout(300)
  await page.locator('[data-act="buy"][data-id="energydrink"]').tap()
  await page.waitForTimeout(500)
  const bought = await run(page)
  // The shop front, from outside.
  await page.locator('.g-sheet [data-act="close-sheet"]').tap().catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/3-shop-front.png` })
  // Home: the supper cooks now and uses them up.
  await page.goto('/?morning=0&spawn=res_o&g=2#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.evaluate(() => { location.hash = '#/place/res_o' })
  await supper.waitFor({ state: 'visible', timeout: 15000 })
  const ready = !(await supper.isDisabled())
  await page.screenshot({ path: `${OUT}/4-fridge-stocked.png` })
  await supper.tap()
  await expect(page.locator('#world')).toHaveAttribute('data-activity-step', 'done', { timeout: 90000 })
  await page.waitForTimeout(1000)
  const cooked = await run(page)
  console.log('GREENWAY', JSON.stringify({ fps, before, walked, shelves, items, money0, after: bought.stats.money, energy: bought.stats.energy, fridge: bought.fridge, ready, cookedFridge: cooked.fridge, cookedMoney: cooked.stats.money }, null, 1))
  expect(before.disabled).toBe(true)
  expect(before.why).toContain('Out of pasta and chicken')
  expect(shelves).toEqual(['Groceries', 'Essentials', 'Treats'])
  expect(items).toBe(12)
  expect(bought.stats.money).toBe(money0 - 25 - 70 - 22)
  expect(bought.fridge.pasta).toBe(4)
  expect(bought.fridge.chicken).toBe(4)
  expect(bought.stats.energy).toBe(70)
  expect(ready, 'supper can cook with the groceries').toBe(true)
  expect(cooked.fridge.pasta).toBe(3)
  expect(cooked.fridge.chicken).toBe(3)
  expect(cooked.fridge.leftovers).toBe(1)
  expect(cooked.stats.money, 'cooking costs nothing at the stove').toBe(bought.stats.money)
  expect(errors).toEqual([])
})

test('the shop front: green and white, sign, windows, till (look test)', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/?morning=0#/')
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true })) })
  await page.goto('/?morning=0#/new')
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/(play|morning)/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); Object.assign(s.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true }); localStorage.setItem('mzansiville.v1', JSON.stringify(s)); localStorage.setItem('mzansiville.mapHint', '1') })
  await page.goto('/?morning=0&spawn=greenway&g=3#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/5-arrive.png` })
  const door = await page.evaluate(() => window.mzansiDoorOf('greenway'))
  // (look-test camera: in front of the shop, a little to the side)
  await page.evaluate((d) => window.mzansiCam([d.x + 4, 4.5, d.z + 11], [d.x, 2, d.z - 2]), door)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/6-front.png` })
  await page.evaluate(() => window.mzansiCam(null))
})
