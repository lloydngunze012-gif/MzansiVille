// The women's hoodie close-up on three skin tones, dancing at a few moments of the clip (the
// sleeves must close over the shoulder and the elbow). Screenshots: docs/sprints/creator-studio/.
import { test } from '@playwright/test'
import fs from 'node:fs'
const OUT = 'docs/sprints/creator-studio'
test('hoodie close-up', async ({ page }) => {
  test.setTimeout(120000)
  fs.mkdirSync(OUT, { recursive: true })
  const skins = ['fair', 'amber', 'ebony']
  for (const [name, t, angle] of [['a', 0.3, 0], ['b', 1.1, 0.8], ['c', 1.9, -0.8]]) {
    await page.setViewportSize({ width: 3 * 400, height: 500 })
    await page.goto('/tests/creator/lineup.html')
    await page.evaluate(async ([looks, t, angle]) => window.lineup({ looks, angle, w: 400, h: 500, pose: 'dance', t, zoom: 2.3 }), [skins.map((skin) => ({ gender: 'female', skin, hair: 'crop', outfit: 'hoodie' })), t, angle])
    await page.screenshot({ path: `${OUT}/hoodie-close-${name}.png` })
  }
})
