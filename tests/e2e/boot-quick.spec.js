// Job H (owner, 13 Nov): a blank page can never happen. index.html's guard shows "Something went wrong. Tap to
// reload" when the game fails to start, and logs it (client_errors, kind boot: intercepted here, nothing is sent).
// An older version's save still opens the game.
import { test, expect } from '@playwright/test'

test('H1 a forced boot failure: the reload card, logged, and a tap brings the game back', async ({ page }) => {
  const logged = []
  await page.route('**/rest/v1/client_errors*', (route) => { logged.push(route.request().postDataJSON()); return route.fulfill({ status: 201, body: '' }) })
  await page.route('**/src/main.js*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: "throw new Error('forced boot failure')" }))
  await page.goto('/?errlog=1#/')
  const card = page.locator('.boot-fail')
  await expect(card).toBeVisible({ timeout: 20000 })
  await expect(card).toContainText('Something went wrong.')
  await expect(card).toContainText('Tap to reload')
  await expect.poll(() => logged.length).toBeGreaterThanOrEqual(1)
  expect(logged[0].kind).toBe('boot')
  expect(logged[0].message).toContain('forced boot failure')
  // the file is back: a tap reloads into the game
  await page.unroute('**/src/main.js*')
  await card.tap()
  await expect(page.locator('#app')).not.toHaveAttribute('data-screen', 'boot', { timeout: 30000 })
  await expect(page.locator('html')).toHaveAttribute('data-booted', '1')
  await expect(card).toHaveCount(0)
})

test('H2 a game file that will not load: the card; and nothing drawn in time: the card', async ({ page }) => {
  await page.route('**/src/main.js*', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/#/')
  await expect(page.locator('.boot-fail')).toBeVisible({ timeout: 20000 })
  await page.unroute('**/src/main.js*')
  await page.route('**/src/main.js*', (route) => new Promise(() => {})) // (hangs for ever)
  await page.goto('/?bootwait=3#/', { waitUntil: 'commit' })
  await expect(page.locator('.boot-fail')).toBeVisible({ timeout: 15000 })
})

test('H3 an older version\'s save opens the game, no blank page, no errors', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/?morning=0#/')
  await page.evaluate(() => {
    localStorage.clear()
    // (a save from before the houses, the cast renames and the city: residence names, old ids, no country, no today)
    localStorage.setItem('mzansiville.v1', JSON.stringify({ rulesAccepted: true, run: { mode: 'play', day: 2, phase: 'social', minutes: 800, slotsLeft: 3, queue: [], doneToday: [], weekly: {}, energyCap: 100,
      character: { name: 'Thandi', residence: 'O Block', course: 'Accounting', avatar: { skin: 'amber', hair: 'crop', outfit: 'hoodie' } },
      stats: { money: 300, energy: 50, grades: 40, social: 30, hunger: 50 }, people: { kea: { chats: 2, close: 10 } }, morningDone: true, lectureResolved: true } }))
  })
  await page.goto('/?morning=0#/play')
  await expect(page.locator('html')).toHaveAttribute('data-booted', '1', { timeout: 30000 })
  await page.waitForTimeout(3000)
  await expect(page.locator('.boot-fail')).toHaveCount(0)
  expect(await page.locator('#app').innerHTML()).not.toBe('')
  expect(errors).toEqual([])
})
