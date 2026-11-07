// Screenshots for Lloyd (docs/sprints/creator-studio/, not committed). TAG=before|after.
// The creator at 390x844, and Regular next to Curvy in jeans and in the dress, front and side.
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-studio'
const TAG = process.env.TAG || 'after'

test('creator, female and male', async ({ browser }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/creator-${TAG}-female.png` })
  await page.locator('[data-gender="male"]').first().tap()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}/creator-${TAG}-male.png` })
  await ctx.close()
})

test('curvy next to regular', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  for (const [name, outfit] of [['jeans', 'shirt'], ['dress', 'dress']]) {
    for (const [view, angle] of [['front', 0], ['side', Math.PI / 2]]) {
      await page.setViewportSize({ width: 440, height: 420 })
      await page.goto('/tests/creator/lineup.html')
      await page.evaluate(async ([outfit, angle]) => window.lineup({ looks: ['regular', 'curvy'].map((body) => ({ gender: 'female', skin: 'amber', hair: 'crop', outfit, body })), angle }), [outfit, angle])
      await page.screenshot({ path: `${OUT}/curvy-${TAG}-${name}-${view}.png` })
    }
  }
})
