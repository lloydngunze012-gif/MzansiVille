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

const world = new Set(['map', 'place', 'closed', 'event', 'twist', 'bestie', 'summary', 'graduated'])

for (const name of screens) {
  test(name, async ({ page }) => {
    await page.goto(`/?shot=${name}`)
    // World screens share the 3D home (.g-screen.g-3d) and name themselves play/place/summary.
    if (world.has(name)) {
      await page.waitForSelector('.g-screen.g-3d')
      await page.waitForSelector('#world[data-ready="1"]')
    } else await page.waitForSelector(`[data-screen="${name}"]`)
    if (name === 'place' || name === 'closed') await page.waitForSelector('.g-sheet')
    if (name === 'event' || name === 'twist' || name === 'bestie' || name === 'graduated') {
      await page.waitForSelector('.g-full, .g-result, .g-card-wrap')
    }
    if (name === 'summary') await page.waitForSelector('.g-summary')
    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: !world.has(name), animations: 'disabled' })
  })
}

for (const mode of ['top', 'sims', 'eye']) {
  test(`cam-${mode}`, async ({ page }) => {
    await page.goto(`/?shot=cam-${mode}`)
    await page.waitForSelector('#world[data-ready="1"]')
    await page.waitForSelector(`#world[data-cam="${mode}"]`)
    await page.screenshot({ path: `screenshots/cam-${mode}.png`, animations: 'disabled' })
  })
}
