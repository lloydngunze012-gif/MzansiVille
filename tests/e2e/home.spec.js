// Day 1: leaving home (src/world/home.js), played by taps. Both home styles: a suburban
// house (From: KwaZulu-Natal) and a township street house (From: Limpopo). Screenshots of each
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

// The same three cameras while the reply cards are up: the cards cover the camera buttons,
// so the camera is switched with the event those buttons send (screenshots only).
async function camsUnderCards(page, name) {
  for (const mode of ['top', 'sims', 'eye']) {
    await page.evaluate((m) => window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: m })), mode)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${name}_${mode}.png` })
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mzansi-cam', { detail: 'sims' })))
}

for (const [style, from] of [['suburban', 'KwaZulu-Natal'], ['township', 'Limpopo']]) {
  test(`day 1 home: ${style} (${from})`, async ({ page }) => {
    test.setTimeout(300000)
    fs.mkdirSync(OUT, { recursive: true })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    // (a model missing from a kit is an error: the chairs once silently never appeared)
    page.on('console', (m) => { if (/home: no model/.test(m.text())) errors.push(m.text()) })
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
    await expect(host).toHaveAttribute('data-seated', '1', { timeout: 30000 })
    await expect(page.locator('#home-ui .mm-choice')).toHaveCount(3, { timeout: 30000 })
    await page.screenshot({ path: `${OUT}/${style}_4_sibling.png` })
    // everyone on a chair, facing the table: read where they are, then Top, Sims and Eye
    const seats = await page.evaluate(() => window.mzansiHomeSeats?.())
    console.log('SEATS', style, JSON.stringify(seats))
    for (const who of ['player', 'sibling', 'parent']) {
      expect(seats[who].pose, `${who} sits`).toBe('sit')
      expect(Math.abs(seats[who].seatY - 0.48), `${who} on the chair seat`).toBeLessThan(0.02)
      expect(seats[who].offChair, `${who} on their chair`).toBeLessThan(0.05)
      expect(Math.abs(seats[who].facingOff), `${who} faces the table`).toBeLessThan(0.05)
      expect(Math.abs(seats[who].seatGap), `${who}'s trousers on the seat`).toBeLessThan(0.05)
      expect(Math.abs(seats[who].footGap), `${who}'s feet on the floor`).toBeLessThan(0.05)
      expect(Math.abs(seats[who].tilt), `${who} upright`).toBeLessThan(0.05)
    }
    await camsUnderCards(page, `${style}_4_breakfast`)
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
    // the car pulls up at UMzansi's Main Gate: goodbye, a hug, money, the car drives off
    await expect(page).toHaveURL(/#\/play/, { timeout: 60000 })
    let run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
    expect(run.morningDone).toBe(true)
    expect(run.home).toMatchObject({ style, sibling: 'deal' })
    const world = page.locator('#world')
    const money = run.stats.money
    // (the cards move on by themselves in tests, 1.5 s each: a slow screenshot must not miss one, so every line shown is recorded)
    await page.evaluate(() => {
      window.__dpLines = []
      new MutationObserver(() => { const t = document.querySelector('.dp-line')?.textContent; if (t && !window.__dpLines.includes(t)) window.__dpLines.push(t) }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    // (at 10x speed the car is in within a second: catch it arriving or just stopped)
    await expect(world).toHaveAttribute('data-dropoff', /arrive|goodbye/, { timeout: 30000 })
    await page.screenshot({ path: `${OUT}/${style}_7_gate_arrive.png` })
    await expect(world).toHaveAttribute('data-dropoff', 'goodbye', { timeout: 30000 })
    await expect(page.locator('.dp-card')).toBeVisible()
    await page.screenshot({ path: `${OUT}/${style}_8_gate_goodbye.png` })
    await expect(world).toHaveAttribute('data-hug', '1', { timeout: 30000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${style}_9_hug.png` })
    await expect.poll(() => page.evaluate(() => window.__dpLines.join(' | ')), { timeout: 30000 }).toContain('For food, not for parties')
    await page.screenshot({ path: `${OUT}/${style}_10_money.png` })
    await expect(world).toHaveAttribute('data-dropoff', 'walk', { timeout: 60000 })
    run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
    expect(run.stats.money, 'the money from home').toBeGreaterThan(money)
    await expect(world).toHaveAttribute('data-suitcase', '1')
    await expect(page.locator('.g-route')).toContainText('Roll your suitcase')
    await page.screenshot({ path: `${OUT}/${style}_11_suitcase.png` })
    // to your house door, where your roommate meets you and the day starts
    await page.locator('.dp-walk').tap()
    await expect(world).toHaveAttribute('data-dropoff', 'door', { timeout: 90000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${style}_12_door.png` })
    await expect(world).toHaveAttribute('data-dropoff', 'done', { timeout: 30000 })
    await expect(page.locator('.g-goals')).toBeVisible({ timeout: 20000 })
    run = await page.evaluate(() => JSON.parse(localStorage.getItem('mzansiville.v1')).run)
    expect(run.dropOff).toBeUndefined()
    expect(run.lectureRoute).toBe(true)
    expect(errors).toEqual([])
  })
}
