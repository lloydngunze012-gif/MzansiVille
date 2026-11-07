// Cream theme (owner, 6 Nov): screenshots of the main screens at 412x915, to look at, and
// a check that no big panel is still dark purple. Shots: docs/sprints/cream/.
// Run: npx playwright test tests/e2e/cream.spec.js --config playwright.gpu.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/cream'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

async function student(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.screenshot({ path: `${OUT}/0-creator.png` })
  await enrolUI(page, { name: 'Thandi', house: 1, course: 1 })
  await page.waitForURL(/#\/play/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'lecture', minutes: 9 * 60 + 55, lectureResolved: false })
    Object.assign(save.run.stats, { money: 1500, energy: 85, hunger: 95, grades: 57, social: 34 })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
    localStorage.setItem('mzansiville.mapHint', '1')
  })
}
// Big dark panels on screen (a background with every channel under 80, over 4000 px²).
const darkPanels = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
  const r = el.getBoundingClientRect()
  if (r.width * r.height < 4000 || r.bottom < 0 || r.top > innerHeight || el.closest('canvas')) return false
  const st = getComputedStyle(el)
  if (st.visibility === 'hidden' || st.display === 'none' || +st.opacity === 0) return false
  const m = st.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/)
  return m && (m[4] === undefined || +m[4] > 0.5) && +m[1] < 80 && +m[2] < 80 && +m[3] < 80
}).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`))

test('cream screens', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await student(page)
  const dark = {}
  // Campus in your common room, then its sheet.
  await page.goto('/?fast=1&morning=0&n=1#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/1-campus.png` })
  dark.campus = await darkPanels(page)
  // Step into your own house (the minimap opens the map, your house's pin walks you in), then
  // open "Things to do" there and check that panel.
  const home = await page.evaluate(() => window.mzansiHomeId())
  for (let i = 0; i < 4 && !(await page.locator(`.map-overlay [data-place="${home}"]`).isVisible()); i++) {
    await page.locator('#world .minimap').tap()
    await page.waitForTimeout(1000)
  }
  await page.locator(`.map-overlay [data-place="${home}"]`).tap()
  await expect(page.locator('#world')).toHaveAttribute('data-house', /.+/, { timeout: 60000 })
  // (walking in opens the house's "Things to do" sheet; close it and open it again from the bar)
  await expect(page.locator('.g-sheet'), 'Things to do opens when you step in').toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/2-sheet.png` })
  dark.sheet = await darkPanels(page)
  await page.locator('.g-sheet [data-act="close-sheet"]').first().tap()
  await expect(page.locator('.g-sheet')).toBeHidden({ timeout: 10000 })
  await page.screenshot({ path: `${OUT}/2a-house.png` })
  dark.house = await darkPanels(page)
  await page.locator('.house-do').tap({ timeout: 10000 })
  await expect(page.locator('.g-sheet'), 'the bar button opens it again').toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(800)
  dark.sheetAgain = await darkPanels(page)
  await page.keyboard.press('Escape').catch(() => {})
  // Out on the Quad: the bottom bar, the camera buttons, the menu, the chat.
  await page.goto('/?fast=1&morning=0&spawn=quad&n=2#/play')
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/3-quad.png` })
  dark.quad = await darkPanels(page)
  await page.locator('[data-act="gear"]').tap()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/4-menu.png` })
  dark.menu = await darkPanels(page)
  await page.locator('.g-scrim').first().tap({ position: { x: 20, y: 600 }, timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('.chat-btn').tap({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/5-chat.png` })
  dark.chat = await darkPanels(page)
  // Your card, Settings.
  await page.goto('/?fast=1&morning=0&n=3#/profile')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/6-profile.png` })
  dark.profile = await darkPanels(page)
  await page.goto('/?fast=1&morning=0&n=4#/settings')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/7-settings.png` })
  dark.settings = await darkPanels(page)
  // Today's event (the full-screen card) and a consequence card.
  for (const [name, card] of [
    ['8-event', { id: 'event-cafeteria_special-1', kind: 'event', title: 'Cafeteria special', text: 'Bunny chow special: half price until two. The queue is already round the corner and past the notice board.', choices: ['Join the queue', 'Skip it and save'], eventId: 'cafeteria_special' }],
    ['9-hungry', { id: 'hungry-1', kind: 'consequence', tone: 'hungry', title: 'Running on empty', text: 'Your stomach is louder than the lecturer. Eat something before you study.' }],
  ]) {
    await page.goto('/audio/CREDITS.md')
    await page.evaluate((c) => { const s = JSON.parse(localStorage.getItem('mzansiville.v1')); s.run.queue = [c]; localStorage.setItem('mzansiville.v1', JSON.stringify(s)) }, card)
    await page.goto(`/?fast=1&morning=0&spawn=quad&n=${name}#/play`)
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    dark[name] = await darkPanels(page)
  }
  console.log('DARK', JSON.stringify(dark, null, 1))
  expect(Object.entries(dark).filter(([, panels]) => panels.length), 'no big dark panel on any screen').toEqual([])
})
