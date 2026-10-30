import { test } from '@playwright/test'

const screens = [
  'title',
  'rules',
  'privacy',
  'terms',
  'create',
  'map',
  'place',
  'closed',
  'event',
  'twist',
  'bestie',
  'summary',
  'refill',
  'gameover',
  'graduated',
  'save',
  'profile',
  'chat',
  'leaderboard',
  'share',
  'shop',
  'admin',
]

for (const name of screens) {
  test(name, async ({ page }) => {
    await page.goto(`/?shot=${name}`)
    await page.waitForSelector(`[data-screen="${name}"]`)
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true })
  })
}
