// Cream theme (owner, 6 Nov): screenshots of the main screens at 412x915, to look at, and
// a check that no big panel is still dark purple. Shots: docs/sprints/cream/.
// Run: npx playwright test tests/e2e/cream.spec.js --config playwright.gpu.config.js
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'docs/sprints/cream'
test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
test.setTimeout(240000)

async function student(page) {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.screenshot({ path: `${OUT}/0-creator.png` })
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
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
  await page.locator('.house-do').tap().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/2-sheet.png` })
  dark.sheet = await darkPanels(page)
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
  await page.locator('.g-scrim').first().tap({ position: { x: 20, y: 600 } }).catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('.chat-btn').tap().catch(() => {})
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
  console.log('DARK', JSON.stringify(dark, null, 1))
})
