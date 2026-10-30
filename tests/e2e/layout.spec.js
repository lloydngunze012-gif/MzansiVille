// Item 4: phone layout. The creator shows the whole 3D student; the cover keeps heads in.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const OUT = 'test-results/layout'
test.use({ viewport: { width: 412, height: 915 } })

test('cover and creator on a phone', async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true })
  await page.goto('/#/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/#/')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/1-cover.png` })
  await page.goto('/#/new')
  for (const [part, id] of [['gender', 'female'], ['outfit', 'organt'], ['hair', 'braids']]) await page.locator(`[data-part="${part}"][data-id="${id}"]`).tap()
  await expect(page.locator('.cc-stage')).toHaveClass(/cc-has3d/, { timeout: 20000 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/2-creator.png` })
  await page.locator('[data-part="outfit"][data-id="dress"]').tap()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/3-creator-dress.png` })
})
