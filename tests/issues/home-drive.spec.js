// Issue 1 (Lloyd, 7 Nov): "the car drives straight through the car parked in front". On the street,
// after the door, read what stands in the family car's swept path (window.mzansiHomeClear) in both
// home styles; then the car really drives out (the scene moves on). Screenshots: docs/sprints/play-fixes/.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { enrolUI } from '../enrol.js'

const OUT = 'docs/sprints/play-fixes'
const TAG = process.env.TAG || 'after'
test.setTimeout(300000)
test.describe.configure({ mode: 'serial' })

for (const [style, from] of [['suburban', 'KwaZulu-Natal'], ['township', 'Limpopo']]) {
  test(`${TAG}: the way out is clear (${style})`, async ({ page }) => {
    fs.mkdirSync(OUT, { recursive: true })
    await page.goto('/?fast=1&talk=auto#/new')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?fast=1&talk=auto#/new')
    await enrolUI(page, { name: 'Thandi', house: 1, course: 1, from })
    const host = page.locator('#home3d')
    const atStep = (s) => expect(host).toHaveAttribute('data-step', s, { timeout: 90000 })
    const go = () => page.locator('#home-ui .mm-bar:not([hidden]) .mm-go').first().tap()
    await expect(host).toHaveAttribute('data-ready', '1', { timeout: 60000 })
    await atStep('window'); await go()
    await atStep('stairs'); await go()
    await atStep('breakfast'); await go()
    await expect(host).toHaveAttribute('data-seated', '1', { timeout: 30000 })
    await expect(page.locator('#home-ui .mm-choice')).toHaveCount(3, { timeout: 30000 })
    await page.locator('#home-ui .mm-choice').nth(1).tap()
    await atStep('bags'); await go()
    await atStep('door'); await go()
    await atStep('yard')
    await page.waitForTimeout(2500)
    const hits = await page.evaluate(() => window.mzansiHomeClear())
    console.log(`${style}: in the car's way`, JSON.stringify(hits))
    // the street from the Top camera, the car and what is parked
    await page.locator('.g-view[data-mode="top"]').tap()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${TAG}-home-yard-${style}.png` })
    await go()
    await expect(host).toHaveAttribute('data-driving', '1', { timeout: 30000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${TAG}-home-drive-${style}.png` })
    expect(hits.filter((h) => !/^(shell|player|dog|parent|sibling)/i.test(h.name)), 'nothing in the way of the car').toEqual([])
    await expect(page).toHaveURL(/#\/play/, { timeout: 60000 })
  })
}
