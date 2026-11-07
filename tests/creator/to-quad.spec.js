// From the creator to the Quad at 20 fps or above (real GPU): the creator's studio draws at a
// phone's real rate, then the student made there (curvy, fair, blond hair) walks onto the Quad
// and the campus draws at 20 fps or more. A hard failure below 20, not a skip.
import { test, expect } from '@playwright/test'
import { PHONE, student } from '../basics/touch.js'
import { measureFps } from '../fps.js'

test.use(PHONE)
test.setTimeout(300000)

test('creator to Quad at 20 fps or above', async ({ page }) => {
  await page.goto('/?morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?morning=0#/new')
  await page.locator('.cc-stage.cc-has3d').waitFor({ timeout: 40000 })
  // the creator's own frame rate: rAF ticks over 3 s
  const creatorFps = await page.evaluate(() => new Promise((resolve) => { let n = 0; const t0 = performance.now(); const tick = (now) => { n++; if (now - t0 < 3000) requestAnimationFrame(tick); else resolve(Math.round((n * 1000) / (now - t0))) }; requestAnimationFrame(tick) }))
  console.log('creator FPS', creatorFps)
  expect(creatorFps, 'the creator').toBeGreaterThanOrEqual(20)
  await student(page, { spawn: 'quad', gender: 'female', avatar: { body: 'curvy', skin: 'fair', hairColor: '#e0b85c' } })
  const quadFps = await measureFps(page)
  console.log('Quad FPS', quadFps)
  expect(quadFps, 'the Quad').toBeGreaterThanOrEqual(20)
})
