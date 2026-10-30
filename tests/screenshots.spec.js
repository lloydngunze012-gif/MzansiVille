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
    await page.waitForSelector(`[data-screen="${name}"]`)
    if (world.has(name)) await page.waitForSelector('#world[data-ready="1"]')
    if (name === 'map') await page.waitForSelector('.map-overlay:not([hidden])')
    if (name === 'place') await page.waitForSelector('.sheet')
    if (name === 'event' || name === 'twist' || name === 'bestie' || name === 'graduated') {
      await page.waitForSelector('.glass-card')
    }
    if (name === 'summary') await page.waitForSelector('.summary-panel')
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
