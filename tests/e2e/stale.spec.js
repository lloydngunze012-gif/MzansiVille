// Stale page after a redeploy (owner, 6 Nov): a game file that fails to load shows
// "Updating..." for a second and the page reloads itself; never a green screen. The 3D
// campus file is made to fail once (as a chunk gone from the server would); after the
// reload it loads and the campus is there.
import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true })
test.setTimeout(180000)

test('a game file that fails to load: Updating..., a reload, then the campus', async ({ page }) => {
  await page.goto('/?fast=1&morning=0#/new')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/?fast=1&morning=0#/new')
  await page.locator('#name').fill('Thandi')
  await page.locator('#residence').selectOption({ index: 1 })
  await page.locator('#course').selectOption({ index: 1 })
  await page.locator('[data-act="begin"]').tap()
  await page.locator('[data-step="story"] [data-act="begin"]').tap()
  await page.waitForURL(/#\/play/)
  await page.goto('/audio/CREDITS.md')
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('mzansiville.v1'))
    Object.assign(save.run, { morningDone: true, queue: [], phase: 'social', minutes: 13 * 60, lectureResolved: true })
    localStorage.setItem('mzansiville.v1', JSON.stringify(save))
  })
  // The campus file is gone once (a redeploy), then back (the new build).
  let failed = 0
  await page.route(/\/src\/world\/scene\.js/, (route) => { if (failed++ === 0) route.fulfill({ status: 404, body: 'gone' }); else route.continue() })
  let loads = 0
  page.on('load', () => { loads += 1 })
  await page.goto('/?fast=1&morning=0#/play')
  await expect(page.locator('.updating')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.updating')).toHaveText(/Updating/)
  await page.screenshot({ path: 'test-results/stale-updating.png' })
  await expect(page.locator('#world')).toHaveAttribute('data-ready', '1', { timeout: 40000 })
  expect(loads, 'the page reloaded itself').toBeGreaterThanOrEqual(2)
  expect(failed, 'the campus file was asked for again after the reload').toBeGreaterThanOrEqual(2)
})
