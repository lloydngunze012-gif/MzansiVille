// Day 1: leaving home (src/world/home.js), played by taps. Both home styles: a suburban
// house (From: Durban) and a township street house (From: Soweto). Screenshots of each
// from Top, Sims and Eye, inside and out on the street.
// Run: npx playwright test tests/e2e/home.spec.js --config playwright.gpu.config.js --workers=1
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

test.describe.configure({ mode: 'serial' })
const OUT = process.env.HOME_SHOTS || 'docs/sprints/home'

async function newStudent(page, from, gender = 'female', query = '') {
  await page.goto(`/?fast=1&talk=auto${query}#/new`)
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/?fast=1&talk=auto${query}#/new`)
  await page.locator(`[data-part="gender"][data-id="${gender}"]`).tap()
  await enrolUI(page, { name: gender === 'male' ? 'Lethabo' : 'Thandi', house: 1, course: 1, from })
}

async function cams(page, name) {
  for (const mode of ['top', 'sims', 'eye']) {
    await page.locator(`.g-view[data-mode="${mode}"]`).tap()
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${name}_${mode}.png` })
  }
  await page.locator('.g-view[data-mode="sims"]').tap()
}

for (const [style, from] of [['suburban', 'Durban'], ['township', 'Soweto']]) {
  test(`day 1 home: ${style} (${from})`, async ({ page }) => {
    test.setTimeout(300000)
    fs.mkdirSync(OUT, { recursive: true })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    const host = page.locator('#home3d')
    const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 60000 })
    const go = () => page.locator('#home-ui .mm-bar:not([hidden]) .mm-go').first().tap()
    await newStudent(page, from)
    await expect(page).toHaveURL(/#\/morning/)
    await expect(host).toHaveAttribute('data-ready', '1', { timeout: 60000 })
    await expect(host).toHaveAttribute('data-style', style)
    await expect(page.locator('.g-goal')).toContainText('Leaving home')
    await atStep('window')
    await page.waitForTimeout(1200)
    await cams(page, `${style}_1_bedroom`)
    // the window: the street outside
    await go()
    await expect(host).toHaveAttribute('data-window', '1', { timeout: 30000 })
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${OUT}/${style}_2_window.png` })
    await atStep('stairs')
    await go()
    await atStep('breakfast')
    expect(Number(await host.getAttribute('data-py'))).toBeLessThan(0.1) // downstairs
    await go()
    await expect(host).toHaveAttribute('data-plate', '1', { timeout: 30000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${style}_3_breakfast.png` })
    await expect(page.locator('#home-ui .mm-choice')).toHaveCount(3, { timeout: 30000 })
    await page.screenshot({ path: `${OUT}/${style}_4_sibling.png` })
    await page.locator('#home-ui .mm-choice').nth(1).tap()
    await atStep('bags')
    await go()
    await expect(host).toHaveAttribute('data-bags', '1', { timeout: 30000 })
    await atStep('door')
    await go()
    await atStep('yard')
    await page.waitForTimeout(1500)
    await cams(page, `${style}_5_street`)
    await go()
    await expect(host).toHaveAttribute('data-driving', '1', { timeout: 30000 })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${style}_6_drive.png` })
    // the car pulls up at UMzansi's Main Gate
    await expect(page).toHaveURL(/#\/play/, { timeout: 60000 })
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
    expect(run.morningDone).toBe(true)
    expect(run.home).toMatchObject({ style, sibling: 'deal' })
    expect(errors).toEqual([])
  })
}
